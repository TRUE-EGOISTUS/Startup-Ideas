import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Input, List, Typography, message } from "antd";
import { api } from "../lib/api";
import type { Message, Task } from "../types";
import { useAuthStore } from "../store/auth";

export function TaskChatPage() {
  const { taskId } = useParams();
  const { user } = useAuthStore();
  const [task, setTask] = useState<Task | null>(null);
  const [messagesData, setMessagesData] = useState<Message[]>([]);
  const [text, setText] = useState("");

  const loadTask = async () => {
    if (!taskId) {
      return;
    }
    try {
      const { data } = await api.get<Task[]>("/tasks");
      const found = data.find((item) => item.id === Number(taskId)) || null;
      setTask(found);
    } catch {
      message.error("Не удалось загрузить задачу");
    }
  };

  const loadMessages = async () => {
    if (!taskId) {
      return;
    }
    try {
      const { data } = await api.get<Message[]>(`/tasks/${taskId}/messages`, {
        params: { since: 0, skip: 0, limit: 50 }
      });
      setMessagesData(data);
    } catch {
      message.error("Не удалось загрузить сообщения");
    }
  };

  useEffect(() => {
    loadTask();
    loadMessages();
  }, [taskId]);

  const canChat = !!task && !!user && (user.id === task.author_id || user.id === task.assigned_to_id);

  const onSendMessage = async () => {
    if (!taskId || !text.trim()) {
      return;
    }
    try {
      await api.post(`/tasks/${taskId}/messages`, { text });
      setText("");
      loadMessages();
    } catch {
      message.error("Не удалось отправить сообщение");
    }
  };

  if (!canChat) {
    return (
      <Card>
        <Typography.Text>Чат доступен только автору задачи и назначенному исполнителю.</Typography.Text>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Typography.Title level={2}>Чат по задаче #{taskId}</Typography.Title>
      <Card>
        <List
          dataSource={messagesData}
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
        <Button className="mt-3" type="primary" size="large" onClick={onSendMessage}>
          Отправить
        </Button>
      </Card>
    </div>
  );
}
