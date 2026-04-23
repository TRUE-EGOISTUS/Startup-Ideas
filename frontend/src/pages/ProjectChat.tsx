import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Input, List, Space, Typography, message } from "antd";
import { api } from "../lib/api";
import type { Message } from "../types";

export function ProjectChatPage() {
  const { projectId } = useParams();
  const [projectMessages, setProjectMessages] = useState<Message[]>([]);
  const [taskIdForChat, setTaskIdForChat] = useState("");
  const [text, setText] = useState("");

  const loadProjectMessages = async () => {
    if (!projectId || !taskIdForChat) {
      return;
    }
    try {
      const { data } = await api.get<Message[]>(
        `/tasks/${taskIdForChat}/messages/projects/${projectId}/messages`,
        { params: { since: 0, skip: 0, limit: 50 } }
      );
      setProjectMessages(data);
    } catch {
      message.error("Не удалось загрузить сообщения проекта");
    }
  };

  useEffect(() => {
    if (taskIdForChat) {
      loadProjectMessages();
    }
  }, [taskIdForChat]);

  const onSendProjectMessage = async () => {
    if (!projectId || !taskIdForChat || !text.trim()) {
      message.error("Укажите task_id и текст сообщения");
      return;
    }
    try {
      await api.post(`/tasks/${taskIdForChat}/messages/projects/${projectId}/messages`, { text });
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
        <Space direction="vertical" className="w-full">
          <Input
            placeholder="task_id (нужен для текущего API)"
            value={taskIdForChat}
            onChange={(event) => setTaskIdForChat(event.target.value)}
          />
          <Button onClick={loadProjectMessages}>Загрузить сообщения</Button>
        </Space>
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
