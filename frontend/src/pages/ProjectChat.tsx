import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Input, List, Typography, message } from "antd";
import { api } from "../lib/api";
import type { Message, Project } from "../types";

export function ProjectChatPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [projectMessages, setProjectMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const lastMessageIdRef = useRef<number | null>(null);
  const messagesRequestRef = useRef(false);

  const loadProject = async () => {
    if (!projectId) return;
    try {
      const { data } = await api.get<Project>(`/ideas/projects/${projectId}`);
      setProject(data);
    } catch {
      message.error("Не удалось загрузить проект");
    }
  };

  const loadProjectMessages = async (options: {
    afterId?: number;
    beforeId?: number;
    silent?: boolean;
  } = {}) => {
    if (!projectId) {
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
      const { data } = await api.get<Message[]>(
        `/projects/${projectId}/messages`,
        {
          params: {
            ...(options.afterId !== undefined ? { after_id: options.afterId } : {}),
            ...(options.beforeId !== undefined ? { before_id: options.beforeId } : {}),
            limit: 50
          }
        }
      );

      if (options.beforeId !== undefined) {
        setProjectMessages((current) => {
          const knownIds = new Set(current.map((item) => item.id));
          return [...data.filter((item) => !knownIds.has(item.id)), ...current];
        });
        setHasOlderMessages(data.length === 50);
      } else if (options.afterId !== undefined) {
        setProjectMessages((current) => {
          const knownIds = new Set(current.map((item) => item.id));
          return [...current, ...data.filter((item) => !knownIds.has(item.id))];
        });
      } else {
        setProjectMessages(data);
        setHasOlderMessages(data.length === 50);
      }

      if (data.length > 0 && options.beforeId === undefined) {
        lastMessageIdRef.current = data[data.length - 1].id;
      }
    } catch {
      if (!options.silent) {
        message.error("Не удалось загрузить сообщения проекта");
      }
    } finally {
      messagesRequestRef.current = false;
      if (!options.silent) {
        setMessagesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!projectId) return;

    lastMessageIdRef.current = null;
    void loadProject();
    void loadProjectMessages();

    const pollMessages = () => {
      if (document.visibilityState !== "visible") return;
      void loadProjectMessages(
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
    };
  }, [projectId]);

  const onSendProjectMessage = async () => {
    if (!projectId || !text.trim()) {
      message.error("Введите текст сообщения");
      return;
    }
    try {
      await api.post(`/projects/${projectId}/messages`, { text });
      setText("");
      await loadProjectMessages(
        lastMessageIdRef.current === null
          ? {}
          : { afterId: lastMessageIdRef.current }
      );
    } catch {
      message.error("Не удалось отправить сообщение");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2} className="page-title">
        Чат проекта №{project?.display_id ?? "-"} - {project?.name || "Проект"}
      </Typography.Title>
      <Card>
        <Typography.Text type="secondary">Общие сообщения участников проекта</Typography.Text>
      </Card>
      <Card>
        {hasOlderMessages && (
          <Button
            className="mb-3"
            onClick={() => projectMessages[0] && loadProjectMessages({ beforeId: projectMessages[0].id })}
            loading={messagesLoading}
          >
            Загрузить предыдущие сообщения
          </Button>
        )}
        <List
          dataSource={projectMessages}
          loading={messagesLoading}
          locale={{ emptyText: "Сообщений пока нет" }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={item.sender_name || `User ${item.user_id}`}
                description={item.text}
              />
            </List.Item>
          )}
        />
      </Card>
      <Card>
        <Input.TextArea
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Напишите сообщение"
        />
        <Button className="mt-3" type="primary" size="large" onClick={onSendProjectMessage}>
          Отправить
        </Button>
      </Card>
    </div>
  );
}
