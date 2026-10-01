import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Input, Tag, Typography, message } from "antd";
import { api, getUserPublic } from "../lib/api";
import type { Message, PublicUser, Task } from "../types";
import { useAuthStore } from "../store/auth";
import "./TaskChat.css";

const CHAT_MAX_LENGTH = 2000;
type DeliveryStatus = "sending" | "error";
type ChatMessage = Message & { localId: string; deliveryStatus?: DeliveryStatus };

function parseUtcDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

function dateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(parseUtcDate(value));
}

function dayLabel(value: string) {
  const date = parseUtcDate(value);
  const today = dateKey(new Date().toISOString());
  const yesterday = dateKey(new Date(Date.now() - 86400000).toISOString());
  const key = dateKey(value);
  if (key === today) return "Сегодня";
  if (key === yesterday) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(date);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(parseUtcDate(value));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function messageContent(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
    /^https?:\/\//i.test(part) ? (
      <a key={`${part}-${index}`} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
    ) : part
  );
}

export function TaskChatPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [task, setTask] = useState<Task | null>(null);
  const [assignedExecutor, setAssignedExecutor] = useState<PublicUser | null>(null);
  const [messagesData, setMessagesData] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [taskLoading, setTaskLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const lastMessageIdRef = useRef<number | null>(null);
  const messagesRequestRef = useRef(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousLastIdRef = useRef<number | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);

  const loadTask = async () => {
    if (!taskId) {
      return;
    }
    setTaskLoading(true);
    try {
      const { data } = await api.get<Task>(`/tasks/${taskId}`);
      setTask(data);
    } catch {
      message.error("Не удалось загрузить задачу");
    } finally {
      setTaskLoading(false);
    }
  };

  const loadMessages = async (options: {
    afterId?: number;
    beforeId?: number;
    silent?: boolean;
  } = {}) => {
    if (!taskId) {
      return;
    }
    if (messagesRequestRef.current) {
      return;
    }
    messagesRequestRef.current = true;
    if (!options.silent) {
      setMessagesLoading(true);
    }
    try {
      const { data } = await api.get<Message[]>(`/tasks/${taskId}/messages`, {
        params: {
          ...(options.afterId !== undefined ? { after_id: options.afterId } : {}),
          ...(options.beforeId !== undefined ? { before_id: options.beforeId } : {}),
          limit: 50
        }
      });

      if (options.beforeId !== undefined) {
        setMessagesData((current) => {
          const knownIds = new Set(current.map((item) => item.id));
          return [...data.filter((item) => !knownIds.has(item.id)).map((item) => ({ ...item, localId: String(item.id) })), ...current];
        });
        setHasOlderMessages(data.length === 50);
      } else if (options.afterId !== undefined) {
        setMessagesData((current) => {
          const knownIds = new Set(current.map((item) => item.id));
          return [...current, ...data.filter((item) => !knownIds.has(item.id)).map((item) => ({ ...item, localId: String(item.id) }))];
        });
      } else {
        setMessagesData(data.map((item) => ({ ...item, localId: String(item.id) })));
        setHasOlderMessages(data.length === 50);
      }

      if (data.length > 0 && options.beforeId === undefined) {
        lastMessageIdRef.current = data[data.length - 1].id;
      }
    } catch {
      if (!options.silent) {
        message.error("Не удалось загрузить сообщения");
      }
    } finally {
      messagesRequestRef.current = false;
      if (!options.silent) {
        setMessagesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!taskId) {
      return;
    }

    lastMessageIdRef.current = null;
    void loadTask();
    void loadMessages();

    const websocketBase = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/^http/, "ws");
    const socket = new WebSocket(`${websocketBase}/tasks/${taskId}/messages/ws`);
    websocketRef.current = socket;
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as Message & { type?: string };
      if (payload.type !== "message") return;
      setMessagesData((current) => {
        if (current.some((item) => item.id === payload.id)) return current;
        const pendingIndex = current.findIndex((item) =>
          item.deliveryStatus === "sending" && item.user_id === payload.user_id && item.text === payload.text
        );
        const serverMessage = { ...payload, localId: String(payload.id), deliveryStatus: undefined } as ChatMessage;
        if (pendingIndex >= 0) {
          const next = [...current];
          next[pendingIndex] = serverMessage;
          return next;
        }
        return [...current, serverMessage];
      });
      lastMessageIdRef.current = payload.id;
    };

    const pollMessages = () => {
      if (document.visibilityState !== "visible") return;
      void loadMessages(
        lastMessageIdRef.current === null
          ? { silent: true }
          : { afterId: lastMessageIdRef.current, silent: true }
      );
    };
    const pollingId = window.setInterval(pollMessages, 4000);
    document.addEventListener("visibilitychange", pollMessages);

    return () => {
      window.clearInterval(pollingId);
      document.removeEventListener("visibilitychange", pollMessages);
      socket.close();
      websocketRef.current = null;
    };
  }, [taskId]);

  useEffect(() => {
    if (!task?.assigned_to_id) {
      setAssignedExecutor(null);
      return;
    }
    getUserPublic(task.assigned_to_id)
      .then(({ data }) => setAssignedExecutor(data))
      .catch(() => setAssignedExecutor(null));
  }, [task?.assigned_to_id]);

  const canChat = !!task && !!user &&
    (task.execution_mode === "open" || !!task.assigned_to_id) &&
    (user.id === task.author_id || user.id === task.assigned_to_id);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior });
    shouldStickToBottomRef.current = true;
    setShowNewMessages(false);
  };

  useEffect(() => {
    if (!messagesData.length) return;
    const latestId = messagesData[messagesData.length - 1].id;
    if (shouldStickToBottomRef.current || previousLastIdRef.current === null) {
      requestAnimationFrame(() => scrollToBottom("auto"));
    } else if (latestId !== previousLastIdRef.current) {
      setShowNewMessages(true);
    }
    previousLastIdRef.current = latestId;
  }, [messagesData.length]);

  const handleStreamScroll = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
    shouldStickToBottomRef.current = nearBottom;
    if (nearBottom) setShowNewMessages(false);
  };

  const onSendMessage = async () => {
    const messageText = text.trim();
    if (!taskId || !messageText || sending || messageText.length > CHAT_MAX_LENGTH) {
      return;
    }
    const localId = `local-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: -Date.now(),
      localId,
      task_id: taskId,
      user_id: user?.id ?? 0,
      text: messageText,
      created_at: new Date().toISOString(),
      sender_name: user?.username || user?.email || "Вы",
      deliveryStatus: "sending"
    };
    setMessagesData((current) => [...current, optimisticMessage]);
    setText("");
    setSending(true);
    try {
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({ text: messageText, client_id: localId }));
      } else {
        const { data } = await api.post<Message>(`/tasks/${taskId}/messages/`, { text: messageText });
        setMessagesData((current) => current.map((item) => item.localId === localId ? { ...data, localId: String(data.id) } : item));
        lastMessageIdRef.current = data.id;
      }
    } catch {
      setMessagesData((current) => current.map((item) => item.localId === localId ? { ...item, deliveryStatus: "error" } : item));
    } finally {
      setSending(false);
    }
  };

  const retryMessage = (item: ChatMessage) => {
    setMessagesData((current) => current.filter((messageItem) => messageItem.localId !== item.localId));
    setText(item.text);
  };

  if (taskLoading) {
    return (
      <Card loading>
        <Typography.Text>Загрузка чата...</Typography.Text>
      </Card>
    );
  }

  if (!canChat) {
    return (
      <Card>
        <Typography.Text>Чат доступен только автору задачи и назначенному исполнителю.</Typography.Text>
      </Card>
    );
  }

  return (
    <div className="task-chat-page">
      <button type="button" className="task-chat-back-panel" onClick={() => navigate(`/tasks/${taskId}`)}>
        <span>&larr; Вернуться</span>
      </button>
      <div className="task-chat-content space-y-6">
        <Typography.Title level={2} className="page-title">
          Чат по задаче №{task.display_id} - {task.title}
        </Typography.Title>
        <Card className="task-chat-card" title={<span>Диалог</span>} extra={<Tag color={task.status === "open" ? "green" : "blue"}>{task.status}</Tag>}>
        <div className="task-chat-context">
          <span>Награда: {task.reward ?? "-"}</span>
          <span>Дедлайн: {task.current_executor_deadline || task.deadline || "-"}</span>
          <span>
            Собеседник: {user.id === task.author_id ? (
              assignedExecutor ? <Link to={`/profile/${assignedExecutor.id}`}>{assignedExecutor.email}</Link> : "-"
            ) : (
              <Link to={`/profile/${task.author_id}`}>{task.author_email || "-"}</Link>
            )}
          </span>
        </div>
        <div ref={streamRef} className="task-chat-stream" onScroll={handleStreamScroll}>
          {showNewMessages && (
            <Button className="task-chat-new-button" onClick={() => scrollToBottom()}>
              ↓ Новые сообщения
            </Button>
          )}
        {hasOlderMessages && (
          <Button
            className="task-chat-history-button"
            onClick={() => messagesData[0] && loadMessages({ beforeId: messagesData[0].id })}
            loading={messagesLoading}
          >
            Загрузить предыдущие сообщения
          </Button>
        )}
        {messagesData.length === 0 && !messagesLoading && <Typography.Text type="secondary">Сообщений пока нет</Typography.Text>}
        {messagesData.map((item, index) => {
          const previous = messagesData[index - 1];
          const mine = item.user_id === user.id;
          const grouped = !!previous && previous.user_id === item.user_id && dateKey(previous.created_at) === dateKey(item.created_at);
          const author = mine ? "Вы" : item.sender_name || `User ${item.user_id}`;
          return (
            <div key={item.localId}>
              {(!previous || dateKey(previous.created_at) !== dateKey(item.created_at)) && <div className="task-chat-day">{dayLabel(item.created_at)}</div>}
              <div className={`task-chat-row ${mine ? "task-chat-row--mine" : ""}`}>
                {grouped ? <div className="task-chat-avatar-spacer" /> : <div className="task-chat-avatar" title={author}>{initials(author)}</div>}
                <div className="task-chat-group">
                  {!grouped && <div className="task-chat-author">{author}</div>}
                  <div className={`task-chat-bubble ${item.deliveryStatus === "sending" ? "task-chat-bubble--sending" : ""} ${item.deliveryStatus === "error" ? "task-chat-bubble--error" : ""}`}>
                    <div className="task-chat-text">{messageContent(item.text)}</div>
                    <div className="task-chat-meta">
                      {item.deliveryStatus === "sending" && <span>Отправляется...</span>}
                      {item.deliveryStatus === "error" && <><span className="task-chat-error">Ошибка</span><Button type="link" size="small" onClick={() => retryMessage(item)}>Повторить</Button></>}
                      {!item.deliveryStatus && <span>{timeLabel(item.created_at)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
        </Card>
        <Card>
        <div className="task-chat-composer">
        <Input.TextArea
          rows={3}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSendMessage();
            }
          }}
          placeholder="Напишите сообщение"
        />
        <div className="task-chat-composer-footer">
          <span className="task-chat-counter">{text.length}/{CHAT_MAX_LENGTH} · Enter - отправить, Shift+Enter - новая строка</span>
        <Button type="primary" size="large" loading={sending} disabled={!text.trim() || text.length > CHAT_MAX_LENGTH} onClick={onSendMessage}>
          Отправить
        </Button>
        </div>
        </div>
        </Card>
      </div>
    </div>
  );
}
