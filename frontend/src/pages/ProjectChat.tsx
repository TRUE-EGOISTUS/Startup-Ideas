import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Card, Input, Select, Tag, Typography, message } from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Message, Project, ProjectMember } from "../types";
import { useAuthStore } from "../store/auth";
import {
  CHAT_ALLOWED_EXTENSIONS,
  CHAT_MAX_LENGTH,
  MAX_FILE_SIZE,
  PAGE_SIZE,
  SEND_ACK_TIMEOUT_MS,
  WS_PING_INTERVAL_MS,
  dateKey,
  dayLabel,
  initials,
  messageContent,
  nextLocalId,
  resolveAttachmentUrl,
  resolveAvatarUrl,
  scheduleReconnect,
  sendPing,
  timeLabel,
  validateChatAttachment,
} from "../lib/chat";
import "./TaskChat.css";

type DeliveryStatus = "sending" | "error";
type ReactionSummary = { emoji: string; count: number; user_ids: number[] };

type ProjectChatMessage = Message & {
  localId: string;
  deliveryStatus?: DeliveryStatus;
  is_announcement?: boolean;
  is_pinned?: boolean;
  channel?: string;
  reactions?: ReactionSummary[];
};
type SocketPayload = ProjectChatMessage & {
  type?: string;
  client_id?: string;
  message_id?: number;
  emoji?: string;
  user_id?: number;
  active?: boolean;
  reader_id?: number;
  read_at?: string;
};

export function ProjectChatPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [messagesData, setMessagesData] = useState<ProjectChatMessage[]>([]);
  const [announcements, setAnnouncements] = useState<ProjectChatMessage[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [text, setText] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [channel, setChannel] = useState("general");
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const [searchText, setSearchText] = useState("");
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
  const websocketPingRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const disposedRef = useRef(false);

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

  const loadMembers = async () => {
    if (!projectId) return;
    const generation = generationRef.current;
    try {
      const { data } = await api.get<ProjectMember[]>(`/ideas/projects/${projectId}/members`);
      if (generation === generationRef.current) setMembers(data);
    } catch {
      if (generation === generationRef.current) message.error("Не удалось загрузить участников проекта");
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
          channel,
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
    disposedRef.current = false;
    setProject(null);
    setMembers([]);
    setMessagesData([]);
    setAnnouncements([]);
    setHasOlderMessages(false);
    setShowNewMessages(false);
    setProjectLoading(true);
    setMessagesLoading(true);
    void loadProject();
    void loadMembers();
    void api.post(`/projects/${projectId}/messages/read`).catch(() => undefined);
    // Периодически помечаем как прочитанное
    const readIntervalId = window.setInterval(() => {
      if (!disposed) void api.post(`/projects/${projectId}/messages/read`).catch(() => undefined);
    }, 30000);
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
        let payload: SocketPayload;
        try {
          payload = JSON.parse(event.data) as SocketPayload;
        } catch {
          return;
        }
        if (payload.type === "announcement") {
          setAnnouncements((current) => {
            const updated = current.some((item) => item.id === payload.id)
              ? current.map((item) => item.id === payload.id
                ? { ...item, ...payload, localId: String(payload.id) }
                : item)
              : [{ ...payload, localId: String(payload.id) }, ...current];
            return updated.sort((a, b) =>
              Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) ||
              Date.parse(b.created_at) - Date.parse(a.created_at)
            );
          });
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
            const msg = { ...next[idx] } as ProjectChatMessage;
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
        const messageChannel = payload.channel || "general";
        if (messageChannel !== channelRef.current) return;
        setMessagesData((current) => {
          if (current.some((item) => item.id === payload.id)) return current;
          // Ищем оптимистичное сообщение по client_id — любой статус доставки (sending или error)
          let pendingIndex = payload.client_id
            ? current.findIndex((item) => item.deliveryStatus && item.localId === payload.client_id)
            : -1;
          if (pendingIndex < 0) {
            // Fallback: ищем по совпадению текста и пользователя
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
        if (websocketPingRef.current !== null) {
          window.clearInterval(websocketPingRef.current);
          websocketPingRef.current = null;
        }
        scheduleReconnect(
          connectWebSocket,
          websocketReconnectRef,
          disposedRef,
          () => document.visibilityState === "visible",
          reconnectAttemptRef.current++
        );
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
      disposedRef.current = true;
      window.clearInterval(pollingId);
      window.clearInterval(readIntervalId);
      if (websocketReconnectRef.current !== null) {
        window.clearTimeout(websocketReconnectRef.current);
        websocketReconnectRef.current = null;
      }
      if (websocketPingRef.current !== null) {
        window.clearInterval(websocketPingRef.current);
        websocketPingRef.current = null;
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

  // История загружается отдельно для выбранного канала.
  useEffect(() => {
    if (!projectId) return;
    lastMessageIdRef.current = null;
    previousLastIdRef.current = null;
    shouldStickToBottomRef.current = true;
    setMessagesData([]);
    setHasOlderMessages(false);
    void loadMessages({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, projectId]);

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
        socket.send(JSON.stringify({ text: messageText, channel, client_id: localId }));
      } catch {
        markDeliveryError(localId);
        return;
      }
      // Если сервер не подтвердил сообщение — не оставляем его в "Отправляется..." навсегда
      window.setTimeout(() => markDeliveryError(localId), SEND_ACK_TIMEOUT_MS);
      return;
    }
    try {
      const { data } = await api.post<Message>(`/projects/${projectId}/messages`, { text: messageText, channel, client_id: localId });
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
    const optimisticId = -Date.now();
    shouldStickToBottomRef.current = true;
    setMessagesData((current) => [...current, {
      id: optimisticId, localId, project_id: projectId, user_id: user?.id ?? 0, text: messageText,
      created_at: new Date().toISOString(), sender_name: user?.username || user?.email || "Вы", channel, deliveryStatus: "sending"
    }]);
    setText("");
    setSending(true);
    try {
      if (attachmentFile) {
        const fileToUpload = attachmentFile;
        const { data } = await api.post<Message>(`/projects/${projectId}/messages`, {
          text: messageText, channel, client_id: localId,
        });
        const baseMessage = { ...data, localId: String(data.id) } as ProjectChatMessage;
        setMessagesData((current) => [
          ...current.filter((item) => item.localId !== localId && item.id !== data.id),
          baseMessage,
        ]);
        bumpLastMessageId(data.id);
        setText("");
        setAttachmentFile(null);

        const formData = new FormData();
        formData.append("file", fileToUpload);
        try {
          const attachmentResponse = await api.post<Message>(
            `/projects/${projectId}/messages/${data.id}/attachment`,
            formData
          );
          const attachedMessage = { ...attachmentResponse.data, localId: String(data.id) } as ProjectChatMessage;
          setMessagesData((current) => [
            ...current.filter((item) => item.id !== data.id && item.localId !== localId),
            attachedMessage,
          ]);
        } catch {
          message.error("Сообщение отправлено, но файл не загрузился. Прикрепите файл отдельным сообщением.");
        }
      } else {
        await deliverMessage(localId, messageText);
      }
    } catch {
      // Помечаем ошибку, чтобы пользователь увидел и мог повторить отправку
      setMessagesData((current) =>
        current.map((item) => item.localId === localId ? { ...item, deliveryStatus: "error" as DeliveryStatus } : item)
      );
      message.error("Не удалось отправить сообщение");
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

  const toggleReaction = async (item: ProjectChatMessage) => {
    if (!projectId || item.id < 0) return;
    // Оптимистичное обновление UI
    const wasActive = item.reactions?.some((r) => r.emoji === "👍" && r.user_ids.includes(user?.id ?? -1));
    setMessagesData((current) =>
      current.map((m) => {
        if (m.id !== item.id) return m;
        const reactions = [...(m.reactions || [])];
        const existing = reactions.find((r) => r.emoji === "👍");
        if (wasActive) {
          if (existing && existing.count === 1) {
            return { ...m, reactions: reactions.filter((r) => r.emoji !== "👍") };
          }
          return { ...m, reactions: reactions.map((r) =>
            r.emoji === "👍" ? { ...r, count: r.count - 1, user_ids: r.user_ids.filter((id) => id !== user?.id) } : r
          )};
        } else {
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
      await api.post(`/projects/${projectId}/messages/${item.id}/reactions`, { emoji: "👍" });
    } catch (err: any) {
      setMessagesData((current) =>
        current.map((m) => m.id === item.id ? { ...m, reactions: item.reactions } : m)
      );
    }
  };

  const searchMessages = async (value: string) => {
    if (!projectId) return;
    const query = value.trim();
    if (!query) {
      void loadMessages({ force: true });
      return;
    }
    try {
      const { data } = await api.get<Message[]>(`/projects/${projectId}/messages`, { params: { search: query, limit: 200, channel } });
      setMessagesData(data.map((item) => ({ ...item, localId: String(item.id) })));
    } catch {
      message.error("Не удалось выполнить поиск");
    }
  };

  const togglePinnedAnnouncement = async (item: ProjectChatMessage) => {
    if (!projectId) return;
    try {
      const { data } = await api.post<ProjectChatMessage>(`/projects/${projectId}/messages/${item.id}/pin`);
      setAnnouncements((current) => current.map((announcement) =>
        announcement.id === data.id ? { ...announcement, ...data, localId: String(data.id) } : announcement
      ));
    } catch {
      message.error("Не удалось изменить закрепление");
    }
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
                {isProjectOwner && (
                  <Button type="text" size="small" onClick={() => void togglePinnedAnnouncement(item)}>
                    {item.is_pinned ? "Открепить" : "Закрепить"}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
        {members.length > 0 && (
          <Card title={`Участники проекта (${members.length})`} size="small">
            <div className="task-chat-members">
              {members.map((member) => (
                <Link key={member.id} to={`/profile/${member.user_id}`} className="task-chat-member">
                  <span>{member.username || `User ${member.user_id}`}</span>
                  {member.role && <Tag>{member.role}</Tag>}
                </Link>
              ))}
            </div>
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
            <Select
              value={channel}
              onChange={setChannel}
              options={[
                { value: "general", label: "# general" },
                { value: "development", label: "# development" },
                { value: "design", label: "# design" },
              ]}
            />
            <Input.Search
              value={searchText}
              allowClear
              placeholder="Поиск по истории"
              onChange={(event) => setSearchText(event.target.value)}
              onSearch={(value) => void searchMessages(value)}
            />
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
            {messagesData
              .filter((item) => !item.channel || item.channel === channel)
              .map((item, index, filtered) => {
              const previous = index > 0 ? filtered[index - 1] : null;
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
                      {(item.is_announcement || item.is_pinned) && <div className="task-chat-system-label">{item.is_pinned ? "Закреплённое объявление" : "Объявление"}</div>}
                      {item.reply_to_id && <div className="task-chat-reply-preview">Ответ на сообщение #{item.reply_to_id}</div>}
                      {item.system_type && <div className="task-chat-system-label">{item.system_type}</div>}
                      <div className="task-chat-text">{messageContent(item.text)}</div>
                      {item.attachment_url && <a className="task-chat-attachment" href={resolveAttachmentUrl(item.attachment_url) || "#"} target="_blank" rel="noopener noreferrer">📎 {item.attachment_name || "Вложение"}</a>}
                      <Button type="text" size="small" className="task-chat-reaction-button" onClick={() => void toggleReaction(item)}>
                        👍 {item.reactions?.filter((r) => r.emoji === "👍" && r.count > 0).map((r) => r.count).reduce((a, b) => a + b, 0) || 0}
                      </Button>
                      <div className="task-chat-meta">
                        {item.deliveryStatus === "sending" && <span>Отправляется...</span>}
                        {item.deliveryStatus === "error" && <><span className="task-chat-error">Ошибка</span><Button type="link" size="small" onClick={() => retryMessage(item)}>Повторить</Button></>}
                        {!item.deliveryStatus && <span>{timeLabel(item.created_at)}{mine && item.read_at ? " · Прочитано" : ""}</span>}
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
              <Button type="primary" size="large" loading={sending} disabled={!text.trim() || text.length > CHAT_MAX_LENGTH} onClick={() => void onSendMessage()}>Отправить</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}