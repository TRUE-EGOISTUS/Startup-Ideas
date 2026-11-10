import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Card, Input, Tag, Typography, message } from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Message, Project } from "../types";
import { useAuthStore } from "../store/auth";
import "./TaskChat.css";

const CHAT_MAX_LENGTH = 2000;
const PAGE_SIZE = 50;
const SEND_ACK_TIMEOUT_MS = 10000;
type DeliveryStatus = "sending" | "error";
type ProjectChatMessage = Message & {
  localId: string;
  deliveryStatus?: DeliveryStatus;
  is_announcement?: boolean;
};
type SocketPayload = ProjectChatMessage & { type?: string; client_id?: string };

let localCounter = 0;
function nextLocalId() {
  localCounter += 1;
  return `local-${Date.now()}-${localCounter}`;
}

function parseUtcDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

function dateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(parseUtcDate(value));
}

function dayLabel(value: string) {
  const today = dateKey(new Date().toISOString());
  const yesterday = dateKey(new Date(Date.now() - 86400000).toISOString());
  const key = dateKey(value);
  if (key === today) return "Сегодня";
  if (key === yesterday) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow"
  }).format(parseUtcDate(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow"
  }).format(parseUtcDate(value));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function messageContent(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    // Знаки препинания в конце ссылки ("см. https://x.com.") не должны попадать в href
    const match = /^(.*?)([.,!?;:)\]}"'»]*)$/.exec(part);
    const href = match ? match[1] : part;
    const tail = match ? match[2] : "";
    return (
      <Fragment key={`${part}-${index}`}>
        <a href={href} target="_blank" rel="noopener noreferrer">{href}</a>
        {tail}
      </Fragment>
    );
  });
}

function resolveAvatarUrl(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = api.defaults.baseURL || window.location.origin;
  return `${baseUrl.replace(/\/$/, "")}/${value.replace(/^\//, "")}`;
}

export function ProjectChatPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [messagesData, setMessagesData] = useState<ProjectChatMessage[]>([]);
  const [announcements, setAnnouncements] = useState<ProjectChatMessage[]>([]);
  const [text, setText] = useState("");
  const [announcementText, setAnnouncementText] = useState("");
  const [projectLoading, setProjectLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [websocketConnected, setWebsocketConnected] = useState(false);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const lastMessageIdRef = useRef<number | null>(null);
  const messagesRequestRef = useRef(false);
  const olderRequestRef = useRef(false);
  const generationRef = useRef(0);
  const messagesDataRef = useRef<ProjectChatMessage[]>([]);
  const preserveScrollRef = useRef<{ top: number; height: number } | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousLastIdRef = useRef<number | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const websocketConnectedRef = useRef(false);
  const websocketReconnectRef = useRef<number | null>(null);

  messagesDataRef.current = messagesData;

  const bumpLastMessageId = (id: number) => {
    if (id > 0) lastMessageIdRef.current = Math.max(lastMessageIdRef.current ?? 0, id);
  };

  const loadProject = async () => {
    if (!projectId) return;
    const generation = generationRef.current;
    try {
      const { data } = await api.get<Project>(`/ideas/projects/${projectId}`);
      if (generation !== generationRef.current) return;
      setProject(data);
    } catch {
      if (generation !== generationRef.current) return;
      message.error("Не удалось загрузить проект");
    } finally {
      if (generation === generationRef.current) setProjectLoading(false);
    }
  };

  const loadAnnouncements = async () => {
    if (!projectId) return;
    const generation = generationRef.current;
    try {
      const { data } = await api.get<ProjectChatMessage[]>(`/projects/${projectId}/announcements`);
      if (generation !== generationRef.current) return;
      setAnnouncements(data.map((item) => ({ ...item, localId: String(item.id) })));
    } catch {
      if (generation !== generationRef.current) return;
      message.error("Не удалось загрузить объявления проекта");
    }
  };

  const loadMessages = async (
    options: { afterId?: number; beforeId?: number; silent?: boolean; force?: boolean } = {}
  ) => {
    if (!projectId) return;
    const isOlder = options.beforeId !== undefined;
    const requestRef = isOlder ? olderRequestRef : messagesRequestRef;
    if (!options.force && requestRef.current) return;
    const owns = !options.force;
    if (owns) requestRef.current = true;
    const generation = generationRef.current;
    if (!options.silent) setMessagesLoading(true);
    try {
      const { data } = await api.get<Message[]>(`/projects/${projectId}/messages`, {
        params: {
          ...(options.afterId !== undefined ? { after_id: options.afterId } : {}),
          ...(options.beforeId !== undefined ? { before_id: options.beforeId } : {}),
          limit: PAGE_SIZE
        }
      });
      // Ответ от предыдущего проекта не должен попасть в чат текущего
      if (generation !== generationRef.current) return;
      const prepared: ProjectChatMessage[] = data.map((item) => ({ ...item, localId: String(item.id) }));
      if (isOlder) {
        const knownIds = new Set(messagesDataRef.current.map((item) => item.id));
        const fresh = prepared.filter((item) => !knownIds.has(item.id));
        if (fresh.length > 0) {
          const stream = streamRef.current;
          preserveScrollRef.current = stream ? { top: stream.scrollTop, height: stream.scrollHeight } : null;
        }
        setMessagesData((current) => {
          const ids = new Set(current.map((item) => item.id));
          return [...prepared.filter((item) => !ids.has(item.id)), ...current];
        });
        setHasOlderMessages(data.length === PAGE_SIZE);
      } else if (options.afterId !== undefined) {
        setMessagesData((current) => {
          const ids = new Set(current.map((item) => item.id));
          return [...current, ...prepared.filter((item) => !ids.has(item.id))];
        });
      } else {
        // Полная перезагрузка не должна стирать неотправленные локальные сообщения
        setMessagesData((current) => [...prepared, ...current.filter((item) => item.deliveryStatus)]);
        setHasOlderMessages(data.length === PAGE_SIZE);
      }
      if (data.length > 0 && !isOlder) bumpLastMessageId(data[data.length - 1].id);
      // Пропущено больше одной страницы — догружаем остальное
      if (options.afterId !== undefined && data.length === PAGE_SIZE && lastMessageIdRef.current !== null) {
        void loadMessages({ afterId: lastMessageIdRef.current, silent: true, force: true });
      }
    } catch {
      if (generation === generationRef.current && !options.silent) message.error("Не удалось загрузить сообщения проекта");
    } finally {
      if (generation === generationRef.current) {
        if (owns) requestRef.current = false;
        if (!options.silent) setMessagesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!projectId) return;
    let disposed = false;
    generationRef.current += 1;
    // Сброс состояния предыдущего проекта
    lastMessageIdRef.current = null;
    previousLastIdRef.current = null;
    shouldStickToBottomRef.current = true;
    preserveScrollRef.current = null;
    messagesRequestRef.current = false;
    olderRequestRef.current = false;
    setProject(null);
    setMessagesData([]);
    setAnnouncements([]);
    setHasOlderMessages(false);
    setShowNewMessages(false);
    setProjectLoading(true);
    setMessagesLoading(true);
    void loadProject();
    void loadMessages();
    void loadAnnouncements();

    const pollMessages = () => {
      if (document.visibilityState !== "visible" || websocketConnectedRef.current) return;
      void loadMessages(lastMessageIdRef.current === null
        ? { silent: true }
        : { afterId: lastMessageIdRef.current, silent: true });
    };
    const websocketBase = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/^http/, "ws");
    const connectWebSocket = () => {
      if (disposed || document.visibilityState !== "visible") return;
      const existing = websocketRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;
      if (websocketReconnectRef.current !== null) {
        window.clearTimeout(websocketReconnectRef.current);
        websocketReconnectRef.current = null;
      }
      const socket = new WebSocket(`${websocketBase}/projects/${projectId}/messages/ws`);
      websocketRef.current = socket;
      socket.onopen = () => {
        if (socket !== websocketRef.current) return;
        websocketConnectedRef.current = true;
        setWebsocketConnected(true);
        // Подтягиваем сообщения, пропущенные пока соединения не было
        if (lastMessageIdRef.current !== null) {
          void loadMessages({ afterId: lastMessageIdRef.current, silent: true, force: true });
        }
      };
      socket.onmessage = (event) => {
        if (socket !== websocketRef.current) return;
        let payload: SocketPayload;
        try {
          payload = JSON.parse(event.data) as SocketPayload;
        } catch {
          return;
        }
        if (payload.type === "announcement") {
          setAnnouncements((current) =>
            current.some((item) => item.id === payload.id) ? current : [{ ...payload, localId: String(payload.id) }, ...current]
          );
          return;
        }
        if (payload.type !== "message") return;
        setMessagesData((current) => {
          if (current.some((item) => item.id === payload.id)) return current;
          let pendingIndex = payload.client_id
            ? current.findIndex((item) => item.deliveryStatus && item.localId === payload.client_id)
            : -1;
          if (pendingIndex < 0) {
            pendingIndex = current.findIndex((item) =>
              item.deliveryStatus === "sending" && item.user_id === payload.user_id && item.text === payload.text
            );
          }
          const serverMessage: ProjectChatMessage = { ...payload, localId: String(payload.id), deliveryStatus: undefined };
          if (pendingIndex >= 0) {
            const next = [...current];
            next[pendingIndex] = serverMessage;
            return next;
          }
          return [...current, serverMessage];
        });
        bumpLastMessageId(payload.id);
      };
      socket.onerror = () => {
        socket.close();
      };
      socket.onclose = () => {
        // Закрытие старого сокета не должно трогать состояние нового
        if (socket !== websocketRef.current) return;
        websocketRef.current = null;
        websocketConnectedRef.current = false;
        setWebsocketConnected(false);
        if (!disposed && document.visibilityState === "visible") {
          websocketReconnectRef.current = window.setTimeout(connectWebSocket, 3000);
        }
      };
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      // Вкладка снова видима: восстанавливаем сокет (раньше он не переподключался вообще)
      connectWebSocket();
      pollMessages();
    };
    connectWebSocket();
    const pollingId = window.setInterval(pollMessages, 4000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(pollingId);
      if (websocketReconnectRef.current !== null) {
        window.clearTimeout(websocketReconnectRef.current);
        websocketReconnectRef.current = null;
      }
      const socket = websocketRef.current;
      websocketRef.current = null;
      websocketConnectedRef.current = false;
      setWebsocketConnected(false);
      socket?.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior });
    shouldStickToBottomRef.current = true;
    setShowNewMessages(false);
  };

  useLayoutEffect(() => {
    // Подгрузили старые сообщения — сохраняем позицию, чтобы список не "прыгал"
    const preserve = preserveScrollRef.current;
    if (preserve) {
      preserveScrollRef.current = null;
      const stream = streamRef.current;
      if (stream) stream.scrollTop = preserve.top + (stream.scrollHeight - preserve.height);
      return;
    }
    if (!messagesData.length) return;
    const last = messagesData[messagesData.length - 1];
    const mine = !!user?.id && last.user_id === user.id;
    if (shouldStickToBottomRef.current || previousLastIdRef.current === null || mine) {
      requestAnimationFrame(() => scrollToBottom("auto"));
    } else if (last.id !== previousLastIdRef.current) {
      setShowNewMessages(true);
    }
    previousLastIdRef.current = last.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesData.length]);

  const markDeliveryError = (localId: string) => {
    setMessagesData((current) =>
      current.map((item) => item.localId === localId && item.deliveryStatus === "sending"
        ? { ...item, deliveryStatus: "error" }
        : item)
    );
  };

  const deliverMessage = async (localId: string, messageText: string) => {
    if (!projectId) return;
    const socket = websocketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ text: messageText, client_id: localId }));
      } catch {
        markDeliveryError(localId);
        return;
      }
      // Если сервер не подтвердил сообщение — не оставляем его в "Отправляется..." навсегда
      window.setTimeout(() => markDeliveryError(localId), SEND_ACK_TIMEOUT_MS);
      return;
    }
    try {
      const { data } = await api.post<Message>(`/projects/${projectId}/messages`, { text: messageText });
      const serverMessage: ProjectChatMessage = { ...data, localId: String(data.id) };
      setMessagesData((current) =>
        current.some((item) => item.id === data.id)
          ? current.filter((item) => item.localId !== localId)
          : current.map((item) => item.localId === localId ? serverMessage : item)
      );
      bumpLastMessageId(data.id);
    } catch {
      markDeliveryError(localId);
    }
  };

  const onSendMessage = async () => {
    const messageText = text.trim();
    if (!projectId || !messageText || sending || messageText.length > CHAT_MAX_LENGTH) return;
    const localId = nextLocalId();
    const optimisticId = -localCounter;
    shouldStickToBottomRef.current = true;
    setMessagesData((current) => [...current, {
      id: optimisticId, localId, project_id: projectId, user_id: user?.id ?? 0, text: messageText,
      created_at: new Date().toISOString(), sender_name: user?.username || user?.email || "Вы", deliveryStatus: "sending"
    }]);
    setText("");
    setSending(true);
    try {
      await deliverMessage(localId, messageText);
    } finally {
      setSending(false);
    }
  };

  const onAnnounce = async () => {
    const announcement = announcementText.trim();
    if (!projectId || !announcement || announcing) return;
    setAnnouncing(true);
    try {
      const { data } = await api.post<ProjectChatMessage>(`/projects/${projectId}/messages/announce`, { text: announcement });
      setAnnouncements((current) =>
        current.some((item) => item.id === data.id) ? current : [{ ...data, localId: String(data.id) }, ...current]
      );
      setAnnouncementText("");
      message.success("Объявление опубликовано");
    } catch {
      message.error("Не удалось опубликовать объявление");
    } finally {
      setAnnouncing(false);
    }
  };

  const retryMessage = (item: ProjectChatMessage) => {
    // Переотправляем сразу, не затирая то, что пользователь уже набрал в поле ввода
    setMessagesData((current) =>
      current.map((messageItem) => messageItem.localId === item.localId
        ? { ...messageItem, deliveryStatus: "sending" }
        : messageItem)
    );
    void deliverMessage(item.localId, item.text);
  };

  if (projectLoading) return <Card loading><Typography.Text>Загрузка чата...</Typography.Text></Card>;

  const isProjectOwner = !!user?.id && project?.created_by === user.id;

  return (
    <div className="task-chat-page">
      <button type="button" className="task-chat-back-panel" onClick={() => navigate(`/projects/${projectId}`)}>
        <span>&larr; Вернуться</span>
      </button>
      <div className="task-chat-content space-y-6">
        <Typography.Title level={2} className="page-title">
          Чат проекта №{project?.display_id ?? "-"} - {project?.name || "Проект"}
        </Typography.Title>
        {announcements.length > 0 && (
          <Card title="Важные объявления" size="small">
            {announcements.slice(0, 3).map((item) => (
              <div key={item.id} className="task-chat-context">
                <Tag color="gold">Объявление</Tag>
                <span className="task-chat-text">{messageContent(item.text)}</span>
                <span>{timeLabel(item.created_at)}</span>
              </div>
            ))}
          </Card>
        )}
        {isProjectOwner && (
          <Card title="Опубликовать объявление" size="small">
            <Input.TextArea rows={2} value={announcementText} maxLength={CHAT_MAX_LENGTH}
              onChange={(event) => setAnnouncementText(event.target.value)} placeholder="Например: созвон сегодня в 19:00" />
            <Button className="mt-3" type="primary" ghost loading={announcing}
              disabled={!announcementText.trim() || announcementText.trim().length > CHAT_MAX_LENGTH} onClick={() => void onAnnounce()}>Опубликовать</Button>
          </Card>
        )}
        <Card className="task-chat-card" title="Общий чат" extra={<Tag color={websocketConnected ? "green" : "default"}>{websocketConnected ? "Онлайн" : "Подключение..."}</Tag>}>
          <div className="task-chat-context">
            <span>Участники проекта</span>
            <span>Сообщения обновляются в реальном времени</span>
          </div>
          <div ref={streamRef} className="task-chat-stream" onScroll={() => {
            const stream = streamRef.current;
            if (!stream) return;
            const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
            shouldStickToBottomRef.current = nearBottom;
            if (nearBottom) setShowNewMessages(false);
          }}>
            {showNewMessages && <Button className="task-chat-new-button" onClick={() => scrollToBottom()}>↓ Новые сообщения</Button>}
            {hasOlderMessages && <Button className="task-chat-history-button" onClick={() => {
              const oldest = messagesData.find((item) => item.id > 0);
              if (oldest) void loadMessages({ beforeId: oldest.id });
            }} loading={messagesLoading}>Загрузить предыдущие сообщения</Button>}
            {messagesData.length === 0 && !messagesLoading && <Typography.Text type="secondary">Сообщений пока нет</Typography.Text>}
            {messagesData.map((item, index) => {
              const previous = messagesData[index - 1];
              const mine = item.user_id === user?.id;
              const grouped = !!previous && previous.user_id === item.user_id && dateKey(previous.created_at) === dateKey(item.created_at);
              const author = mine ? (user?.username || user?.email || "Пользователь") : item.sender_name || `User ${item.user_id}`;
              const avatarUrl = resolveAvatarUrl(item.sender_avatar_url);
              return <div key={item.localId}>
                {(!previous || dateKey(previous.created_at) !== dateKey(item.created_at)) && <div className="task-chat-day">{dayLabel(item.created_at)}</div>}
                <div className={`task-chat-row ${mine ? "task-chat-row--mine" : ""}`}>
                  {grouped ? <div className="task-chat-avatar-spacer" /> : <Link to={`/profile/${item.user_id}`} className="task-chat-avatar-link" title={`Открыть профиль: ${author}`}>
                    <div className="task-chat-avatar">{avatarUrl ? <img src={avatarUrl} alt={author} /> : initials(author)}</div>
                  </Link>}
                  <div className="task-chat-group">
                    {!grouped && !mine && <div className="task-chat-author">{author}</div>}
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
              </div>;
            })}
          </div>
        </Card>
        <Card>
          <div className="task-chat-composer">
            <Input.TextArea rows={3} value={text} maxLength={CHAT_MAX_LENGTH}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // isComposing: не отправляем сообщение, пока идёт набор через IME
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void onSendMessage();
                }
              }}
              placeholder="Напишите сообщение" />
            <div className="task-chat-composer-footer">
              <span className="task-chat-counter">{text.length}/{CHAT_MAX_LENGTH} · Enter - отправить, Shift+Enter - новая строка</span>
              <Button type="primary" size="large" loading={sending} disabled={!text.trim() || text.length > CHAT_MAX_LENGTH} onClick={() => void onSendMessage()}>Отправить</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}