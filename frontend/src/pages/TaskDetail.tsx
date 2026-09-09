import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom"; // добавлен Link
import { Button, Card, Descriptions, Form, Input, InputNumber, List, Tag, Typography, message, Tabs, Empty } from "antd";
import { api } from "../lib/api";
import { Task, TaskExecution, TaskResponse } from "../types";
import { useAuthStore } from "../store/auth";

export function TaskDetailPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [solutions, setSolutions] = useState<TaskExecution[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const isCompany = user?.role === "company";
  const isSpecialist = user?.role === "specialist";
  const isOpenMode = task?.execution_mode === "open";
  const isClassicMode = !task?.execution_mode || task?.execution_mode === "classic";
  const canChat = !!task && !!user && (user.id === task.author_id || user.id === task.assigned_to_id);
  const responses = task?.responses ?? [];
  const executions = task?.executions ?? [];
  const canRespondClassic = isSpecialist && isClassicMode &&
    (task?.status === "open" || task?.status === "ready_for_next");
  const canSubmitClassicSolution = isSpecialist && isClassicMode &&
    task?.assigned_to_id === user?.id && task?.status === "in_progress";
  const canReviewClassicSolution = isCompany && isClassicMode && task?.status === "awaiting_review";
  const pendingResponses = responses.filter((response) => response.status === "pending");

  const loadTask = async () => {
    if (!taskId) return;
    try {
      const { data } = await api.get<Task>(`/tasks/${taskId}`);
      setTask(data);
    } catch {
      message.error("Не удалось загрузить задачу");
    }
  };

  const loadSolutions = async () => {
    if (!taskId) return;
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

  useEffect(() => {
    if (isCompany && isOpenMode) {
      loadSolutions();
    }
  }, [isCompany, isOpenMode, taskId]);

  const onRespond = async (values: { message: string }) => {
    if (!taskId) return;
    try {
      await api.post(`/tasks/${taskId}/responses`, values);
      message.success("Отклик отправлен");
      loadTask();
    } catch {
      message.error("Не удалось отправить отклик");
    }
  };

  const onAcceptResponse = async (responseId: number) => {
    if (!taskId) return;
    try {
      await api.put(`/tasks/${taskId}/responses/${responseId}/accept`);
      message.success("Исполнитель назначен");
      loadTask();
    } catch {
      message.error("Не удалось принять отклик");
    }
  };

  const onRejectResponse = async (responseId: number) => {
    if (!taskId) return;
    try {
      await api.put(`/tasks/${taskId}/responses/${responseId}/reject`);
      message.success("Отклик отклонён");
      loadTask();
    } catch {
      message.error("Не удалось отклонить отклик");
    }
  };

  const onComplete = async (values: { solution_url?: string; comment?: string }) => {
    if (!taskId) return;
    try {
      await api.post(`/tasks/${taskId}/complete`, values);
      message.success("Задача отправлена на ревью");
      loadTask();
    } catch {
      message.error("Не удалось завершить задачу");
    }
  };

  const onReview = async (values: { rating: number; feedback?: string }) => {
    if (!taskId) return;
    try {
      await api.post(`/tasks/${taskId}/review`, values);
      message.success("Ревью отправлено");
      loadTask();
    } catch {
      message.error("Не удалось отправить ревью");
    }
  };

  const onSubmitOpenSolution = async (values: { solution_url?: string; comment?: string }) => {
    if (!taskId) return;
    try {
      await api.post(`/tasks/${taskId}/open-solution`, values);
      message.success("Решение отправлено");
      loadSolutions();
      loadTask();
    } catch {
      message.error("Не удалось отправить решение");
    }
  };

  const onAcceptSolution = async (values: { execution_id: number; rating: number; feedback?: string }) => {
    if (!taskId) return;
    try {
      await api.put(`/tasks/${taskId}/solutions/${values.execution_id}/accept`, null, {
        params: { rating: values.rating, feedback: values.feedback }
      });
      message.success("Решение принято");
      loadSolutions();
      loadTask();
    } catch {
      message.error("Не удалось принять решение");
    }
  };

  const onCloseTask = async () => {
    if (!taskId) return;
    try {
      await api.put(`/tasks/${taskId}/close`);
      message.success("Задача закрыта и удалена");
      navigate("/tasks");
    } catch {
      message.error("Не удалось закрыть задачу");
    }
  };

  const tabItems = [
    {
      key: "overview",
      label: "Обзор",
      children: task ? (
        <Card title="Детали">
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Название">{task.title}</Descriptions.Item>
            <Descriptions.Item label="Создатель">
              <Link to={`/profile/${task.author_id}`}>{task.author_email || "-"}</Link>
            </Descriptions.Item>
            <Descriptions.Item label="Исполнитель">
              {task.assigned_to_id ? (
                <Link to={`/profile/${task.assigned_to_id}`}>Исполнитель #{task.assigned_to_id}</Link>
              ) : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Описание">{task.description || "-"}</Descriptions.Item>
            <Descriptions.Item label="Статус">
              <Tag className="status-tag" color={task.status === "open" ? "green" : task.status === "closed" ? "red" : "blue"}>
                {task.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Режим">{task.execution_mode || "classic"}</Descriptions.Item>
            <Descriptions.Item label="Награда">{task.reward ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Сложность">{task.difficulty || "-"}</Descriptions.Item>
          </Descriptions>
        </Card>
      ) : (
        <Empty description="Данных по задаче пока нет" />
      )
    },
    ...(canChat
      ? [{
          key: "chat",
          label: "Чат",
          children: (
            <Card>
              <Button type="primary">
                <Link to={`/tasks/${taskId}/chat`}>Открыть чат задачи</Link>
              </Button>
            </Card>
          )
        }]
      : []),
    ...(isSpecialist && isClassicMode && (canRespondClassic || canSubmitClassicSolution)
      ? [{
          key: "respond",
          label: canSubmitClassicSolution ? "Сдача решения" : "Отклик",
          children: (
            <div className="space-y-6">
              {canRespondClassic && (
                <Card title="Откликнуться">
                  <Form layout="vertical" onFinish={onRespond}>
                    <Form.Item label="Сообщение" name="message" rules={[{ required: true }]}>
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">Отправить</Button>
                  </Form>
                </Card>
              )}
              {canSubmitClassicSolution && (
                <Card title="Завершить задачу (исполнитель)">
                  <Form layout="vertical" onFinish={onComplete}>
                    <Form.Item label="Ссылка на решение" name="solution_url">
                      <Input />
                    </Form.Item>
                    <Form.Item label="Комментарий" name="comment">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">Отправить</Button>
                  </Form>
                </Card>
              )}
            </div>
          )
        }]
      : []),
    ...(isSpecialist && isOpenMode
      ? [{
          key: "open-solution",
          label: "Решение",
          children: (
            <Card title="Open-режим: отправить решение">
              <Form layout="vertical" onFinish={onSubmitOpenSolution}>
                <Form.Item label="Ссылка на решение" name="solution_url">
                  <Input />
                </Form.Item>
                <Form.Item label="Комментарий" name="comment">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Button type="primary" htmlType="submit">Отправить</Button>
              </Form>
            </Card>
          )
        }]
      : []),
    ...(isCompany && isClassicMode
      ? [{
          key: "responses",
          label: "Отклики",
          children: (
            <Card title="Отклики специалистов">
              <div className="page-toolbar">
                <Typography.Text>Откликов: {pendingResponses.length}</Typography.Text>
                <Button onClick={loadTask}>Обновить отклики</Button>
              </div>
              <List
                dataSource={pendingResponses}
                locale={{ emptyText: <div className="empty-panel"><Empty description="Пока нет откликов" /></div> }}
                renderItem={(item: TaskResponse) => (
                  <List.Item
                    actions={[
                      <Button key="accept" type="primary" onClick={() => onAcceptResponse(item.id)}>Назначить</Button>,
                      <Button key="reject" danger onClick={() => onRejectResponse(item.id)}>Отклонить</Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={<Link to={`/profile/${item.user_id}`}>{item.user_nickname || `User ${item.user_id}`}</Link>}
                      description={item.message || "Сообщение не указано"}
                    />
                    <Tag className="status-tag">{item.status}</Tag>
                  </List.Item>
                )}
              />
            </Card>
          )
        }]
      : []),
    ...(isCompany && isClassicMode && (executions.length > 0 || canReviewClassicSolution)
      ? [{
          key: "execution",
          label: "Выполнение",
          children: (
            <div className="space-y-6">
              <Card title="Ответ исполнителя">
                <List
                  dataSource={executions}
                  locale={{ emptyText: <div className="empty-panel"><Empty description="Исполнитель ещё не сдал решение" /></div> }}
                  renderItem={(execution) => (
                    <List.Item>
                      <div>
                        <div><strong>Исполнитель:</strong> <Link to={`/profile/${execution.user_id}`}>{execution.user_nickname || `User ${execution.user_id}`}</Link></div>
                        <div>Ссылка на решение: {execution.solution_url || "-"}</div>
                        <div>Комментарий: {execution.comment || "-"}</div>
                        <Tag className="status-tag">{execution.status}</Tag>
                        {(execution.rating || execution.feedback) && (
                          <div className="mt-2">
                            <div>Оценка ревью: {execution.rating ?? "-"}</div>
                            <div>Комментарий ревью: {execution.feedback || "-"}</div>
                          </div>
                        )}
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
              {canReviewClassicSolution && (
                <Card title="Ревью (автор)">
                  <Form layout="vertical" onFinish={onReview}>
                    <Form.Item label="Оценка" name="rating" rules={[{ required: true }]}>
                      <InputNumber min={1} max={5} className="w-full" />
                    </Form.Item>
                    <Form.Item label="Комментарий" name="feedback">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">Отправить</Button>
                  </Form>
                </Card>
              )}
            </div>
          )
        }]
      : []),
    ...(isCompany && isOpenMode
      ? [{
          key: "solutions",
          label: "Решения",
          children: (
            <Card title="Решения (автор)">
              <div className="page-toolbar">
                <Typography.Text>Решений: {solutions.length}</Typography.Text>
                <Button onClick={loadSolutions}>Обновить</Button>
              </div>
              <List
                dataSource={solutions}
                locale={{ emptyText: <div className="empty-panel"><Empty description="Решений пока нет" /></div> }}
                renderItem={(item) => (
                  <List.Item>
                    <div>
                      <div>ID: {item.id} | Исполнитель: <Link to={`/profile/${item.user_id}`}>{item.user_nickname || `User ${item.user_id}`}</Link> | Status: {item.status}</div>
                      <div>URL: {item.solution_url || "-"}</div>
                      <div>Comment: {item.comment || "-"}</div>
                      {(item.rating || item.feedback) && (
                        <div>Ревью: {item.rating ?? "-"} | {item.feedback || "-"}</div>
                      )}
                    </div>
                  </List.Item>
                )}
              />
              <Form layout="inline" onFinish={onAcceptSolution}>
                <Form.Item label="ID решения" name="execution_id" rules={[{ required: true }]}>
                  <InputNumber min={1} />
                </Form.Item>
                <Form.Item label="Оценка" name="rating" rules={[{ required: true }]}>
                  <InputNumber min={1} max={5} />
                </Form.Item>
                <Form.Item label="Комментарий" name="feedback">
                  <Input />
                </Form.Item>
                <Button type="primary" htmlType="submit">Принять</Button>
              </Form>
            </Card>
          )
        }]
      : []),
    ...(isCompany
      ? [{
          key: "danger",
          label: "Закрыть",
          children: (
            <Card title="Закрыть задачу">
              <Button danger onClick={onCloseTask}>Закрыть</Button>
            </Card>
          )
        }]
      : [])
  ];

  return (
    <div className="space-y-6">
      <Typography.Title level={2} className="page-title">Задача #{taskId}</Typography.Title>
      <Tabs items={tabItems} />
    </div>
  );
}