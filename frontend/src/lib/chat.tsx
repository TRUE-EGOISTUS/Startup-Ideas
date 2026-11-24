import { Fragment } from "react";
import type { Message } from "../types";
import { api } from "./api";

// ---------------------------------------------------------------------------
// Timezone helpers – uses user's browser timezone instead of hardcoding MSK
// ---------------------------------------------------------------------------

function getTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Europe/Moscow";
  }
}

const cachedTz = getTimeZone();

export function parseUtcDate(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

export function dateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: cachedTz }).format(parseUtcDate(value));
}

export function dayLabel(value: string) {
  const today = dateKey(new Date().toISOString());
  const yesterday = dateKey(new Date(Date.now() - 86400000).toISOString());
  const key = dateKey(value);
  if (key === today) return "Сегодня";
  if (key === yesterday) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric", timeZone: cachedTz
  }).format(parseUtcDate(value));
}

export function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit", minute: "2-digit", timeZone: cachedTz
  }).format(parseUtcDate(value));
}

export function dateTimeLabel(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: cachedTz
  }).format(parseUtcDate(value));
}

// ---------------------------------------------------------------------------
// Message rendering helpers
// ---------------------------------------------------------------------------

export function messageContent(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    // Punctuation/brackets at the end of a link should NOT go into href
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

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

export function resolveAvatarUrl(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = api.defaults.baseURL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${baseUrl.replace(/\/$/, "")}/${value.replace(/^\//, "")}`;
}

export function resolveAttachmentUrl(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = api.defaults.baseURL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${baseUrl.replace(/\/$/, "")}/${value.replace(/^\//, "")}`;
}

// ---------------------------------------------------------------------------
// Status / system_type labels (Russian)
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, string> = {
  open: "Открыта",
  in_progress: "В работе",
  awaiting_review: "На проверке",
  closed: "Закрыта",
  pending: "Ожидает",
  accepted: "Принята",
  rejected: "Отклонена",
};

export function statusLabel(status: string) {
  return STATUS_MAP[status] || status.split("_").map((w) =>
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(" ");
}

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  task_assigned: "Задача назначена",
  task_status_changed: "Статус задачи изменён",
  task_completed: "Задача выполнена",
  task_reviewed: "Задача проверена",
  task_reopened: "Задача переоткрыта",
};

export function systemTypeLabel(raw: string | null | undefined) {
  if (!raw) return raw;
  return SYSTEM_TYPE_LABELS[raw] || raw;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CHAT_MAX_LENGTH = 2000;
export const SEND_ACK_TIMEOUT_MS = 10000;
export const PAGE_SIZE = 50;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // backend limit: 10 MiB
export const WS_PING_INTERVAL_MS = 25000;
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliveryStatus = "sending" | "error";

export type ChatMessageBase = Message & {
  localId: string;
  deliveryStatus?: DeliveryStatus;
  reactions?: ReactionSummary[];
};

export type ReactionSummary = { emoji: string; count: number; user_ids: number[] };

export type ReplyTarget = { messageId: number; text: string; author: string };

// ---------------------------------------------------------------------------
// Utility: unique local ID generator
// ---------------------------------------------------------------------------

let localCounter = 0;
export function nextLocalId() {
  localCounter += 1;
  return `local-${Date.now()}-${localCounter}`;
}

// ---------------------------------------------------------------------------
// WebSocket reconnect with exponential backoff + ping
// ---------------------------------------------------------------------------

export function scheduleReconnect(
  connect: () => void,
  ref: { current: number | null },
  disposedRef: { current: boolean },
  visibilityCheck: () => boolean,
  attempt: number
) {
  if (disposedRef.current || !visibilityCheck()) return;
  const delay = Math.min(
    WS_RECONNECT_BASE_MS * Math.pow(2, Math.min(attempt, 10)),
    WS_RECONNECT_MAX_MS
  );
  ref.current = window.setTimeout(() => {
    ref.current = null;
    connect();
  }, delay);
}

export function sendPing(socket: WebSocket | null) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify({ type: "ping" })); } catch { /* ignore */ }
  }
}

export const CHAT_ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp",
  "pdf", "doc", "docx", "txt", "rtf",
  "csv", "xls", "xlsx", "zip", "rar", "7z",
] as const;

export function validateChatAttachment(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return "Файл слишком большой. Максимальный размер — 10 МБ.";
  }
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!CHAT_ALLOWED_EXTENSIONS.includes(extension as (typeof CHAT_ALLOWED_EXTENSIONS)[number])) {
    return "Этот тип файла нельзя прикрепить к сообщению.";
  }
  return null;
}
