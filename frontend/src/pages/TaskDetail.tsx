import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Card, Descriptions, Form, Input, InputNumber, List, Space, Tag, Typography, message } from "antd";
import { api } from "../lib/api";
import { Task, TaskExecution, TaskResponse } from "../types";
import { useAuthStore } from "../store/auth";

export function TaskDetailPage() {
  const { taskId } = useParams();
  const { user } = useAuthStore();
  const [solutions, setSolutions] = useState<TaskExecution[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const isCompany = user?.role === "company";
  const isSpecialist = user?.role === "specialist";
  const isOpenMode = task?.execution_mode === "open";
  const isClassicMode = !task?.execution_mode || task?.execution_mode === "classic";
  const canChat = !!task && !!user && (user.id === task.author_id || user.id === task.assigned_to_id);
  const responses = task?.responses ?? [];

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

  const loadSolutions = async () => {
    if (!taskId) {
      return;
    }
    try {
      const { data } = await api.get<TaskExecution[]>(`/tasks/${taskId}/solutions`);
      setSolutions(data);
    } catch {
      message.error("Не удалось загрузить решения");
    }
  };

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const onRespond = async (values: { message: string }) => {
    if (!taskId) {
      return;
    }
    try {
      await api.post(`/tasks/${taskId}/responses`, values);
      message.success("Отклик отправлен");
    } catch {
      message.error("Не удалось отправить отклик");
    }
  };

  const onAcceptResponse = async (responseId: number) => {
    if (!taskId) {
      return;
    }
    try {
      await api.put(`/tasks/${taskId}/responses/${responseId}/accept`);
      message.success("Исполнитель назначен");
    } catch {
      message.error("Не удалось принять отклик");
    }
  };

  const onComplete = async (values: { solution_url?: string; comment?: string }) => {
    if (!taskId) {
      return;
    }
    try {
      await api.post(`/tasks/${taskId}/complete`, values);
      message.success("Задача отправлена на ревью");
    } catch {
      message.error("Не удалось завершить задачу");
    }
  };

  const onReview = async (values: { rating: number; feedback?: string }) => {
    if (!taskId) {
      return;
    }
    try {
      await api.post(`/tasks/${taskId}/review`, values);
      message.success("Ревью отправлено");
    } catch {
      message.error("Не удалось отправить ревью");
    }
  };

  const onSubmitOpenSolution = async (values: { solution_url?: string; comment?: string }) => {
    if (!taskId) {
      return;
    }
    try {
      await api.post(`/tasks/${taskId}/open-solution`, values);
      message.success("Решение отправлено");
    } catch {
      message.error("Не удалось отправить решение");
    }
  };

  const onAcceptSolution = async (values: { execution_id: number; rating: number; feedback?: string }) => {
    if (!taskId) {
      return;
    }
    try {
      await api.put(`/tasks/${taskId}/solutions/${values.execution_id}/accept`, null, {
        params: { rating: values.rating, feedback: values.feedback }
      });
      message.success("Решение принято");
      loadSolutions();
    } catch {
      message.error("Не удалось принять решение");
    }
  };

  const onCloseTask = async () => {
    if (!taskId) {
      return;
    }
    try {
      await api.put(`/tasks/${taskId}/close`);
      message.success("Задача закрыта");
    } catch {
      message.error("Не удалось закрыть задачу");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2}>Задача #{taskId}</Typography.Title>
      {task && (
        <Card title="Детали">
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Название">{task.title}</Descriptions.Item>
            <Descriptions.Item label="Описание">{task.description || "-"}</Descriptions.Item>
            <Descriptions.Item label="Статус">
              <Tag color={task.status === "open" ? "green" : task.status === "closed" ? "red" : "blue"}>
                {task.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Режим">{task.execution_mode || "classic"}</Descriptions.Item>
            <Descriptions.Item label="Награда">{task.reward ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Сложность">{task.difficulty || "-"}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {canChat && (
        <Card>
          <Button type="primary">
            <Link to={`/tasks/${taskId}/chat`}>Открыть чат задачи</Link>
          </Button>
        </Card>
      )}

      {isSpecialist && isClassicMode && (
        <Card title="Откликнуться">
          <Form layout="vertical" onFinish={onRespond}>
            <Form.Item label="Сообщение" name="message" rules={[{ required: true }]}> 
              <Input.TextArea rows={2} />
            </Form.Item>
            <Button type="primary" htmlType="submit">Отправить</Button>
          </Form>
        </Card>
      )}

      {isSpecialist && isClassicMode && (
        <Card title="Завершить задачу (исполнитель)">
          <Form layout="vertical" onFinish={onComplete}>
            <Form.Item label="Solution URL" name="solution_url">
              <Input />
            </Form.Item>
            <Form.Item label="Комментарий" name="comment">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Button type="primary" htmlType="submit">Отправить</Button>
          </Form>
        </Card>
      )}

      {isSpecialist && isOpenMode && (
        <Card title="Open-режим: отправить решение">
          <Form layout="vertical" onFinish={onSubmitOpenSolution}>
            <Form.Item label="Solution URL" name="solution_url">
              <Input />
            </Form.Item>
            <Form.Item label="Комментарий" name="comment">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Button type="primary" htmlType="submit">Отправить</Button>
          </Form>
        </Card>
      )}

      {isCompany && isClassicMode && (
        <Card title="Отклики специалистов">
          <Space className="mb-3">
            <Button onClick={loadTask}>Обновить отклики</Button>
          </Space>
          {responses.length === 0 ? (
            <Typography.Text>Пока нет откликов.</Typography.Text>
          ) : (
            <List
              dataSource={responses}
              renderItem={(item: TaskResponse) => (
                <List.Item
                  actions={[
                    <Button key="accept" type="primary" onClick={() => onAcceptResponse(item.id)}>Назначить</Button>
                  ]}
                >
                  <List.Item.Meta
                    title={`User ${item.user_id}`}
                    description={item.message || "Сообщение не указано"}
                  />
                  <Tag>{item.status}</Tag>
                </List.Item>
              )}
            />
          )}
        </Card>
      )}

      {isCompany && isClassicMode && (
        <Card title="Ревью (автор)">
          <Form layout="vertical" onFinish={onReview}>
            <Form.Item label="Рейтинг" name="rating" rules={[{ required: true }]}> 
              <InputNumber min={1} max={5} className="w-full" />
            </Form.Item>
            <Form.Item label="Feedback" name="feedback">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Button type="primary" htmlType="submit">Отправить</Button>
          </Form>
        </Card>
      )}

      {isCompany && isOpenMode && (
        <Card title="Решения (автор)">
          <Space className="mb-2">
            <Button onClick={loadSolutions}>Обновить</Button>
          </Space>
          <List
            dataSource={solutions}
            renderItem={(item) => (
              <List.Item>
                <div>
                  <div>ID: {item.id} | User: {item.user_id} | Status: {item.status}</div>
                  <div>URL: {item.solution_url || "-"}</div>
                  <div>Comment: {item.comment || "-"}</div>
                </div>
              </List.Item>
            )}
          />
          <Form layout="inline" onFinish={onAcceptSolution}>
            <Form.Item label="Execution ID" name="execution_id" rules={[{ required: true }]}> 
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item label="Rating" name="rating" rules={[{ required: true }]}> 
              <InputNumber min={1} max={5} />
            </Form.Item>
            <Form.Item label="Feedback" name="feedback">
              <Input />
            </Form.Item>
            <Button type="primary" htmlType="submit">Принять</Button>
          </Form>
        </Card>
      )}

      {isCompany && (
        <Card title="Закрыть задачу">
          <Button danger onClick={onCloseTask}>Закрыть</Button>
        </Card>
      )}

    </div>
  );
}
