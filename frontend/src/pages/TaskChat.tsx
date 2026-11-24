import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Input, Tag, Typography, message } from "antd";
import { api, getUserPublic } from "../lib/api";
import type { Message, PublicUser, Task } from "../types";
import { useAuthStore } from "../store/auth";
import {
  CHAT_ALLOWED_EXTENSIONS,
  CHAT_MAX_LENGTH,
  MAX_FILE_SIZE,
  PAGE_SIZE,
  SEND_ACK_TIMEOUT_MS,
  WS_PING_INTERVAL_MS,
  dateKey,
  dateTimeLabel,
  dayLabel,
  initials,
  messageContent,
  nextLocalId,
  resolveAttachmentUrl,
  resolveAvatarUrl,
  scheduleReconnect,
  sendPing,
  statusLabel,
  timeLabel,
  validateChatAttachment,
} from "../lib/chat";
import "./TaskChat.css";

type DeliveryStatus = "sending" | "error";
type ReactionSummary = { emoji: string; count: number; user_ids: number[] };
type ChatMessage = Message & { localId: string; deliveryStatus?: DeliveryStatus; reactions?: ReactionSummary[] };
type ReplyTarget = { messageId: number; text: string; author: string };

export function TaskChatPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [task, setTask] = useState<Task | null>(null);
  const [assignedExecutor, setAssignedExecutor] = useState<PublicUser | null>(null);
  const [messagesData, setMessagesData] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [searchText, setSearchText] = useState("");
  const [taskLoading, setTaskLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [websocketConnected, setWebsocketConnected] = useState(false);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const lastMessageIdRef = useRef<number | null>(null);
  const messagesRequestRef = useRef(false);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousLastIdRef = useRef<number | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const websocketConnectedRef = useRef(false);
  const websocketReconnectRef = useRef<number | null>(null);
  const websocketPingRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const disposedRef = useRef(false);
  const generationRef = useRef(0);
  const preserveScrollRef = useRef<{ top: number; height: number } | null>(null);

  const loadTask = async () => {
    if (!taskId) {
      return;
    }
    const generation = generationRef.current;
    setTaskLoading(true);
    try {
      const { data } = await api.get<Task>(`/tasks/${taskId}`);
      if (generation !== generationRef.current) return;
      setTask(data);
    } catch {
      if (generation === generationRef.current) {
        message.error("Не удалось загрузить задачу");
      }
    } finally {
      if (generation === generationRef.current) {
        setTaskLoading(false);
      }
    }
  };

  const loadMessages = async (options: {
    afterId?: number;
    beforeId?: number;
    silent?: boolean;
    force?: boolean;
  } = {}) => {
    if (!taskId) {
      return;
    }
    if (!options.force && messagesRequestRef.current) {
      return;
    }
    const ownsRequestLock = !options.force;
    if (ownsRequestLock) messagesRequestRef.current = true;
    const generation = generationRef.current;
    if (!options.silent) {
      setMessagesLoading(true);
    }
    try {
      const { data } = await api.get<Message[]>(`/tasks/${taskId}/messages`, {
        params: {
          ...(options.afterId !== undefined ? { after_id: options.afterId } : {}),
          ...(options.beforeId !== undefined ? { before_id: options.beforeId } : {}),
          limit: PAGE_SIZE
        }
      });

      // Ответ от предыдущей задачи не должен попасть в чат текущей
      if (generation !== generationRef.current) return;

      if (options.beforeId !== undefined) {
        const isOlder = true;
        if (isOlder) {
          const stream = streamRef.current;
          preserveScrollRef.current = stream ? { top: stream.scrollTop, height: stream.scrollHeight } : null;
        }
        setMessagesData((current) => {
          const knownIds = new Set(current.map((item) => item.id));
          return [...data.filter((item) => !knownIds.has(item.id)).map((item) => ({ ...item, localId: String(item.id) })), ...current];
        });
        setHasOlderMessages(data.length === PAGE_SIZE);
      } else if (options.afterId !== undefined) {
        setMessagesData((current) => {
          const knownIds = new Set(current.map((item) => item.id));
          return [...current, ...data.filter((item) => !knownIds.has(item.id)).map((item) => ({ ...item, localId: String(item.id) }))];
        });
      } else {
        // Полная перезагрузка: не затираем локальные неотправленные сообщения
        setMessagesData((current) => {
          const serverIds = new Set(data.map((item) => item.id));
          const preserved = current.filter((item) => item.deliveryStatus && !serverIds.has(item.id));
          return [...data.map((item) => ({ ...item, localId: String(item.id) })), ...preserved];
        });
        setHasOlderMessages(data.length === PAGE_SIZE);
      }

      if (data.length > 0 && options.beforeId === undefined) {
        lastMessageIdRef.current = Math.max(lastMessageIdRef.current ?? 0, data[data.length - 1].id);
      }

      // Пропущено больше одной страницы — догружаем остальное.
      if (options.afterId !== undefined && data.length === PAGE_SIZE && lastMessageIdRef.current !== null) {
        void loadMessages({ afterId: lastMessageIdRef.current, silent: true, force: true });
      }
    } catch {
      if (generation === generationRef.current && !options.silent) {
        message.error("Не удалось загрузить сообщения");
      }
    } finally {
      if (ownsRequestLock) messagesRequestRef.current = false;
      if (generation === generationRef.current && !options.silent) {
        setMessagesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!taskId) {
      return;
    }

    let disposed = false;
    disposedRef.current = false;
    generationRef.current += 1;

    // Сброс состояния предыдущей задачи
    lastMessageIdRef.current = null;
    previousLastIdRef.current = null;
    shouldStickToBottomRef.current = true;
    preserveScrollRef.current = null;
    messagesRequestRef.current = false;
    setTask(null);
    setAssignedExecutor(null);
    setMessagesData([]);
    setHasOlderMessages(false);
    setShowNewMessages(false);
    setTaskLoading(true);
    setMessagesLoading(true);

    void loadTask();
    void loadMessages();
    // Bug 16: помечаем как прочитанное при входе
    void api.post(`/tasks/${taskId}/messages/read`).catch(() => undefined);
    // Периодически помечаем как прочитанное
    const readIntervalId = window.setInterval(() => {
      if (!disposed) void api.post(`/tasks/${taskId}/messages/read`).catch(() => undefined);
    }, 30000);

    const pollMessages = () => {
      if (disposed || document.visibilityState !== "visible" || websocketConnectedRef.current) return;
      void loadMessages(
        lastMessageIdRef.current === null
          ? { silent: true }
          : { afterId: lastMessageIdRef.current, silent: true }
      );
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
      const socket = new WebSocket(`${websocketBase}/tasks/${taskId}/messages/ws`);
      websocketRef.current = socket;
      socket.onopen = () => {
        if (socket !== websocketRef.current) return;
        reconnectAttemptRef.current = 0;
        if (websocketPingRef.current !== null) window.clearInterval(websocketPingRef.current);
        websocketPingRef.current = window.setInterval(() => sendPing(socket), WS_PING_INTERVAL_MS);
        websocketConnectedRef.current = true;
        setWebsocketConnected(true);
        // Подтягиваем сообщения, пропущенные пока соединения не было
        if (lastMessageIdRef.current !== null) {
          void loadMessages({ afterId: lastMessageIdRef.current, silent: true, force: true });
        }
      };
      socket.onmessage = (event) => {
        if (socket !== websocketRef.current) return;
        let payload: Message & {
          type?: string;
          client_id?: string;
          message_id?: number;
          emoji?: string;
          user_id?: number;
          active?: boolean;
          reader_id?: number;
          read_at?: string;
        };
        try {
          payload = JSON.parse(event.data) as typeof payload;
        } catch {
          return;
        }

        // Bug 15: обработка реакции
        if (payload.type === "reaction") {
          setMessagesData((current) => {
            const msgId = (payload as any).message_id;
            const emoji = (payload as any).emoji;
            const userId = (payload as any).user_id;
            const active = (payload as any).active;
            const idx = current.findIndex((item) => item.id === msgId);
            if (idx < 0) return current;
            const next = [...current];
            const msg = { ...next[idx] } as ChatMessage;
            const existing = msg.reactions?.find((r: ReactionSummary) => r.emoji === emoji);
            if (active && !existing) {
              msg.reactions = [...(msg.reactions || []), { emoji, count: 1, user_ids: [userId] }];
            } else if (!active && existing) {
              const updated = existing.count === 1
                ? msg.reactions?.filter((r: ReactionSummary) => r.emoji !== emoji)
                : msg.reactions?.map((r: ReactionSummary) =>
                    r.emoji === emoji ? { ...r, count: r.count - 1, user_ids: r.user_ids.filter((id: number) => id !== userId) } : r
                  );
              msg.reactions = updated;
            }
            next[idx] = msg;
            return next;
          });
          return;
        }

        if (payload.type === "read") {
          const readerId = payload.reader_id;
          if (readerId !== undefined && payload.read_at) {
            setMessagesData((current) => current.map((item) =>
              item.user_id !== readerId && item.id > 0
                ? { ...item, read_at: payload.read_at }
                : item
            ));
          }
          return;
        }

        if (payload.type !== "message") return;
        setMessagesData((current) => {
          // Уже есть такое сообщение — не дублируем
          if (current.some((item) => item.id === payload.id)) return current;
          // Ищем оптимистичное сообщение по client_id или локальному id
          let pendingIndex = payload.client_id
            ? current.findIndex((item) => item.localId === payload.client_id && (item.deliveryStatus === "sending" || item.deliveryStatus === "error"))
            : -1;
          if (pendingIndex < 0) {
            // Ищем по client_id среди всех локальных (отрицательный id)
            pendingIndex = current.findIndex((item) =>
              item.id === -Date.parse(payload.client_id?.replace("local-", "") || "0") && (item.deliveryStatus === "sending" || item.deliveryStatus === "error")
            );
          }
          if (pendingIndex < 0) {
            // Fallback: ищем по совпадению текста и пользователя
            pendingIndex = current.findIndex((item) =>
              item.deliveryStatus === "sending" && item.user_id === payload.user_id && item.text === payload.text
            );
          }
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
      socket.onclose = (event) => {
        // Закрытие старого сокета не должно трогать состояние нового
        if (socket !== websocketRef.current) return;
        websocketRef.current = null;
        websocketConnectedRef.current = false;
        setWebsocketConnected(false);
        if (websocketPingRef.current !== null) {
          window.clearInterval(websocketPingRef.current);
          websocketPingRef.current = null;
        }
        scheduleReconnect(
          connectWebSocket,
          websocketReconnectRef,
          disposedRef,
          () => document.visibilityState === "visible",
          reconnectAttemptRef.current++,
          event.code
        );
      };
    };

    connectWebSocket();
    const pollingId = window.setInterval(pollMessages, 4000);
    const handleVisibilityChange = () => {
      if (disposed) return;
      if (document.visibilityState === "visible") {
        connectWebSocket();
        pollMessages();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      disposedRef.current = true;
      window.clearInterval(pollingId);
      window.clearInterval(readIntervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (websocketReconnectRef.current !== null) window.clearTimeout(websocketReconnectRef.current);
      if (websocketPingRef.current !== null) window.clearInterval(websocketPingRef.current);
      websocketPingRef.current = null;
      websocketConnectedRef.current = false;
      setWebsocketConnected(false);
      websocketRef.current?.close();
      websocketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    if (!task?.assigned_to_id) {
      setAssignedExecutor(null);
      return;
    }
    let disposed = false;
    getUserPublic(task.assigned_to_id)
      .then(({ data }) => { if (!disposed) setAssignedExecutor(data); })
      .catch(() => { if (!disposed) setAssignedExecutor(null); });
    return () => { disposed = true; };
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

  useEffect(() => {
    // Подгрузили старые сообщения — сохраняем позицию, чтобы список не "прыгал"
    const preserve = preserveScrollRef.current;
    if (preserve) {
      preserveScrollRef.current = null;
      const stream = streamRef.current;
      if (stream) stream.scrollTop = preserve.top + (stream.scrollHeight - preserve.height);
    }
  });

  const handleStreamScroll = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
    shouldStickToBottomRef.current = nearBottom;
    if (nearBottom) setShowNewMessages(false);
  };

  const markDeliveryError = (localId: string) => {
    setMessagesData((current) =>
      current.map((item) => item.localId === localId && item.deliveryStatus === "sending"
        ? { ...item, deliveryStatus: "error" }
        : item)
    );
  };

  const deliverMessage = async (localId: string, messageText: string, replyToId?: number) => {
    if (!taskId) return;
    const socket = websocketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ text: messageText, client_id: localId, ...(replyToId !== undefined ? { reply_to_id: replyToId } : {}) }));
      } catch {
        markDeliveryError(localId);
        return;
      }
      // Если сервер не подтвердил сообщение — не оставляем его в "Отправляется..." навсегда
      window.setTimeout(() => markDeliveryError(localId), SEND_ACK_TIMEOUT_MS);
      return;
    }
    try {
      const { data } = await api.post<Message>(`/tasks/${taskId}/messages/`, {
        text: messageText,
        client_id: localId,
        ...(replyToId !== undefined ? { reply_to_id: replyToId } : {}),
      });
      const serverMessage: ChatMessage = { ...data, localId: String(data.id) };
      setMessagesData((current) =>
        current.some((item) => item.id === data.id)
          ? current.filter((item) => item.localId !== localId)
          : current.map((item) => item.localId === localId ? serverMessage : item)
      );
      lastMessageIdRef.current = data.id;
    } catch {
      markDeliveryError(localId);
    }
  };

  const onSendMessage = async () => {
    const messageText = text.trim();
    if (!taskId || !messageText || sending || messageText.length > CHAT_MAX_LENGTH) {
      return;
    }
    const localId = nextLocalId();
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
      if (websocketConnected && websocketRef.current?.readyState === WebSocket.OPEN && !attachmentFile) {
        await deliverMessage(localId, messageText, replyTo?.messageId);
      } else if (attachmentFile) {
        const fileToUpload = attachmentFile;
        const { data } = await api.post<Message>(`/tasks/${taskId}/messages/`, {
          text: messageText,
          reply_to_id: replyTo?.messageId,
          client_id: localId,
        });
        const baseMessage = { ...data, localId: String(data.id) } as ChatMessage;
        setMessagesData((current) => [
          ...current.filter((item) => item.localId !== localId && item.id !== data.id),
          baseMessage,
        ]);
        lastMessageIdRef.current = Math.max(lastMessageIdRef.current ?? 0, data.id);
        setText("");
        setAttachmentFile(null);
        setReplyTo(null);

        const formData = new FormData();
        formData.append("file", fileToUpload);
        try {
          const attachmentResponse = await api.post<Message>(
            `/tasks/${taskId}/messages/${data.id}/attachment`,
            formData
          );
          const attachedMessage = { ...attachmentResponse.data, localId: String(data.id) } as ChatMessage;
          setMessagesData((current) => [
            ...current.filter((item) => item.localId !== localId && item.id !== data.id),
            attachedMessage,
          ]);
        } catch {
          message.error("Сообщение отправлено, но файл не загрузился. Прикрепите файл отдельным сообщением.");
        }
      } else {
        await deliverMessage(localId, messageText, replyTo?.messageId);
      }
      setAttachmentFile(null);
      setReplyTo(null);
    } catch {
      setMessagesData((current) => current.map((item) => item.localId === localId ? { ...item, deliveryStatus: "error" } : item));
    } finally {
      setSending(false);
    }
  };

  const retryMessage = (item: ChatMessage) => {
    // Если сервер уже присвоил id, сообщение доставлено — снимаем только индикатор ошибки.
    if (item.id > 0) {
      setMessagesData((current) =>
        current.map((messageItem) => messageItem.localId === item.localId
          ? { ...messageItem, deliveryStatus: undefined }
          : messageItem)
      );
      return;
    }

    // Если при первом запросе отправлялось вложение, повторяем всю операцию
    // с тем же client_id, чтобы не создать второе текстовое сообщение.
    if (attachmentFile && taskId) {
      setSending(true);
      setMessagesData((current) => current.map((messageItem) =>
        messageItem.localId === item.localId
          ? { ...messageItem, deliveryStatus: "sending" }
          : messageItem
      ));
      try {
        const { data } = await api.post<Message>(`/tasks/${taskId}/messages/`, {
          text: item.text,
          reply_to_id: item.reply_to_id,
          client_id: item.localId,
        });
        const baseMessage = { ...data, localId: String(data.id) } as ChatMessage;
        setMessagesData((current) => [
          ...current.filter((messageItem) => messageItem.localId !== item.localId && messageItem.id !== data.id),
          baseMessage,
        ]);
        lastMessageIdRef.current = Math.max(lastMessageIdRef.current ?? 0, data.id);

        const formData = new FormData();
        formData.append("file", attachmentFile);
        try {
          const attachmentResponse = await api.post<Message>(
            `/tasks/${taskId}/messages/${data.id}/attachment`,
            formData
          );
          setMessagesData((current) => current.map((messageItem) =>
            messageItem.id === data.id
              ? { ...attachmentResponse.data, localId: String(data.id) } as ChatMessage
              : messageItem
          ));
          setAttachmentFile(null);
        } catch {
          message.error("Текст сообщения отправлен, но вложение не загрузилось. Прикрепите файл отдельным сообщением.");
        }
      } catch {
        setMessagesData((current) => current.map((messageItem) =>
          messageItem.localId === item.localId
            ? { ...messageItem, deliveryStatus: "error" }
            : messageItem
        ));
        message.error("Не удалось повторно отправить сообщение");
      } finally {
        setSending(false);
      }
      return;
    }

    // Повторно используем тот же localId/client_id — сервер не создаст дубль.
    setMessagesData((current) =>
      current.map((messageItem) => messageItem.localId === item.localId
        ? { ...messageItem, deliveryStatus: "sending" }
        : messageItem)
    );
    void deliverMessage(item.localId, item.text, item.reply_to_id ?? undefined);
  };

  const searchMessages = async (value: string) => {
    if (!taskId) return;
    const query = value.trim();
    if (!query) {
      void loadMessages();
      return;
    }
    try {
      const { data } = await api.get<Message[]>(`/tasks/${taskId}/messages`, { params: { search: query, limit: 200 } });
      setMessagesData(data.map((item) => ({ ...item, localId: String(item.id) })));
    } catch {
      message.error("Не удалось выполнить поиск");
    }
  };

  const toggleReaction = async (item: ChatMessage) => {
    if (!taskId || item.id < 0) return;
    // Оптимистичное обновление UI
    const wasActive = item.reactions?.some((r) => r.emoji === "👍" && r.user_ids.includes(user?.id ?? -1));
    setMessagesData((current) =>
      current.map((m) => {
        if (m.id !== item.id) return m;
        const reactions = [...(m.reactions || [])];
        const existing = reactions.find((r) => r.emoji === "👍");
        if (wasActive) {
          // Убираем реакцию
          if (existing && existing.count === 1) {
            return { ...m, reactions: reactions.filter((r) => r.emoji !== "👍") };
          }
          return { ...m, reactions: reactions.map((r) =>
            r.emoji === "👍" ? { ...r, count: r.count - 1, user_ids: r.user_ids.filter((id) => id !== user?.id) } : r
          )};
        } else {
          // Добавляем реакцию
          if (existing) {
            return { ...m, reactions: reactions.map((r) =>
              r.emoji === "👍" ? { ...r, count: r.count + 1, user_ids: [...r.user_ids, user?.id ?? 0] } : r
            )};
          }
          return { ...m, reactions: [...reactions, { emoji: "👍", count: 1, user_ids: [user?.id ?? 0] }] };
        }
      })
    );
    try {
      await api.post(`/tasks/${taskId}/messages/${item.id}/reactions`, { emoji: "👍" });
    } catch (err: any) {
      // IntegrityError — реакция уже была/не была, откатываем UI
      setMessagesData((current) =>
        current.map((m) => m.id === item.id ? { ...m, reactions: item.reactions } : m)
      );
    }
  };

  const handleReply = (item: ChatMessage) => {
    setReplyTo({
      messageId: item.id,
      text: item.text.substring(0, 100),
      author: item.sender_name || `User ${item.user_id}`
    });
    // Не стираем набранный текст — просто добавляем префикс ответа
    setText((current) => {
      const prefix = `> @${item.sender_name || `User ${item.user_id}`} wrote:\n${item.text.substring(0, 100)}\n\n`;
      return current ? prefix + current : prefix;
    });
  };

  const cancelReply = () => {
    setReplyTo(null);
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
        <Card className="task-chat-card" title={<span>Диалог</span>} extra={<Tag color={task.status === "open" ? "green" : "blue"}>{statusLabel(task.status)}</Tag>}>
        <div className="task-chat-context">
          <span>Награда: {task.reward ?? "-"}</span>
          <span>Дедлайн: {dateTimeLabel(task.current_executor_deadline || task.deadline)}</span>
          <span>
            Собеседник: {user.id === task.author_id ? (
              assignedExecutor ? <Link to={`/profile/${assignedExecutor.id}`}>{assignedExecutor.username || "Исполнитель"}</Link> : "-"
            ) : (
              <Link to={`/profile/${task.author_id}`}>{task.author_email || "-"}</Link>
            )}
          </span>
          <Input.Search
            value={searchText}
            allowClear
            placeholder="Поиск по истории"
            onChange={(event) => setSearchText(event.target.value)}
            onSearch={(value) => void searchMessages(value)}
          />
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
          const author = mine ? (user.username || user.email || "Пользователь") : item.sender_name || `User ${item.user_id}`;
          return (
            <div key={item.localId}>
              {(!previous || dateKey(previous.created_at) !== dateKey(item.created_at)) && <div className="task-chat-day">{dayLabel(item.created_at)}</div>}
              <div className={`task-chat-row ${mine ? "task-chat-row--mine" : ""}`}>
                {grouped ? <div className="task-chat-avatar-spacer" /> : (
                  <Link to={`/profile/${item.user_id}`} className="task-chat-avatar-link" title={`Открыть профиль: ${author}`}>
                    <div className="task-chat-avatar">
                      {resolveAvatarUrl(item.sender_avatar_url) ? (
                        <img src={resolveAvatarUrl(item.sender_avatar_url) || ""} alt={author} />
                      ) : initials(author)}
                    </div>
                  </Link>
                )}
                <div className="task-chat-group">
                  {!grouped && !mine && <div className="task-chat-author">{author}</div>}
                  <div className={`task-chat-bubble ${item.deliveryStatus === "sending" ? "task-chat-bubble--sending" : ""} ${item.deliveryStatus === "error" ? "task-chat-bubble--error" : ""}`}>
                    {item.reply_to_id && <div className="task-chat-reply-preview">Ответ на сообщение #{item.reply_to_id}</div>}
                    {item.system_type && <div className="task-chat-system-label">{item.system_type}</div>}
                    <div className="task-chat-text">{messageContent(item.text)}</div>
                    {item.attachment_url && <a className="task-chat-attachment" href={resolveAttachmentUrl(item.attachment_url) || "#"} target="_blank" rel="noopener noreferrer">📎 {item.attachment_name || "Вложение"}</a>}
                    <div className="task-chat-bubble-actions">
                      <Button type="text" size="small" className="task-chat-reaction-button" onClick={() => void toggleReaction(item)}>
                        👍 {item.reactions?.filter((r) => r.emoji === "👍" && r.count > 0).map((r) => r.count).reduce((a, b) => a + b, 0) || 0}
                      </Button>
                      <Button type="text" size="small" className="task-chat-reaction-button" onClick={() => handleReply(item)}>↩</Button>
                    </div>
                    <div className="task-chat-meta">
                      {item.deliveryStatus === "sending" && <span>Отправляется...</span>}
                      {item.deliveryStatus === "error" && <><span className="task-chat-error">Ошибка</span><Button type="link" size="small" onClick={() => retryMessage(item)}>Повторить</Button></>}
                      {!item.deliveryStatus && <span>{timeLabel(item.created_at)}{mine && item.read_at ? " · Прочитано" : ""}</span>}
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
        {replyTo && (
          <div className="task-chat-reply-composer">
            <span className="task-chat-reply-label">
              Ответ на <strong>{replyTo.author}</strong>: {replyTo.text}...
            </span>
            <Button type="text" size="small" onClick={cancelReply}>✕</Button>
          </div>
        )}
        <Input.TextArea
          rows={3}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void onSendMessage();
            }
          }}
          placeholder="Напишите сообщение"
        />
        <div className="task-chat-composer-footer">
          <label className="task-chat-file-picker">📎 Прикрепить файл<input
            type="file"
            accept={CHAT_ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              if (!file) return setAttachmentFile(null);
              const error = validateChatAttachment(file);
              if (error) {
                message.error(error);
                event.target.value = "";
                return;
              }
              setAttachmentFile(file);
            }}
          /></label>
          {attachmentFile && <span className="task-chat-attachment-name">{attachmentFile.name} ({(attachmentFile.size / 1024 / 1024).toFixed(1)} МБ, максимум {(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} МБ)</span>}
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
