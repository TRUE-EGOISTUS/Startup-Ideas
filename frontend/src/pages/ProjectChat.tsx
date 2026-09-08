import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Input, List, Typography, message } from "antd";
import { api } from "../lib/api";
import type { Message } from "../types";

export function ProjectChatPage() {
  const { projectId } = useParams();
  const [projectMessages, setProjectMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");

  const loadProjectMessages = async () => {
    if (!projectId) {
      return;
    }
    try {
      const { data } = await api.get<Message[]>(
        `/projects/${projectId}/messages`,
        { params: { since: 0, skip: 0, limit: 50 } }
      );
      setProjectMessages(data);
    } catch {
      message.error("Не удалось загрузить сообщения проекта");
    }
  };

  useEffect(() => {
    loadProjectMessages();
  }, [projectId]);

  const onSendProjectMessage = async () => {
    if (!projectId || !text.trim()) {
      message.error("Введите текст сообщения");
      return;
    }
    try {
      await api.post(`/projects/${projectId}/messages`, { text });
      setText("");
      loadProjectMessages();
    } catch {
      message.error("Не удалось отправить сообщение");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2}>Чат проекта #{projectId}</Typography.Title>
      <Card>
        <Typography.Text type="secondary">Общие сообщения участников проекта</Typography.Text>
      </Card>
      <Card>
        <List
          dataSource={projectMessages}
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
