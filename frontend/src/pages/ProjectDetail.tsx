import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Card, Descriptions, Form, Input, InputNumber, List, Space, Typography, message, Tabs, Empty } from "antd";
import { api } from "../lib/api";
import { Project, ProjectMember } from "../types";

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);

  const loadProject = async () => {
    if (!projectId) {
      return;
    }
    try {
      const { data } = await api.get<Project>(`/ideas/projects/${projectId}`);
      setProject(data);
    } catch {
      message.error("Не удалось загрузить проект");
    }
  };

  const loadMembers = async () => {
    if (!projectId) {
      return;
    }
    try {
      const { data } = await api.get<ProjectMember[]>(`/ideas/projects/${projectId}/members`);
      setMembers(data);
    } catch {
      message.error("Не удалось загрузить участников");
    }
  };

  useEffect(() => {
    loadProject();
    loadMembers();
  }, [projectId]);

  const onInvite = async (values: { user_id: number; role?: string }) => {
    if (!projectId) {
      return;
    }
    try {
      await api.post(`/ideas/projects/${projectId}/invite/${values.user_id}`, null, {
        params: { role: values.role || "member" }
      });
      message.success("Пользователь приглашен");
      loadMembers();
    } catch {
      message.error("Не удалось пригласить пользователя");
    }
  };

  const onRemove = async (values: { user_id: number }) => {
    if (!projectId) {
      return;
    }
    try {
      await api.delete(`/ideas/projects/${projectId}/members/${values.user_id}`);
      message.success("Участник удален");
      loadMembers();
    } catch {
      message.error("Не удалось удалить участника");
    }
  };

  const onLeave = async () => {
    if (!projectId) {
      return;
    }
    try {
      await api.delete(`/ideas/projects/${projectId}/members/me`);
      message.success("Вы вышли из проекта");
    } catch {
      message.error("Не удалось выйти из проекта");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2} className="page-title">Проект #{projectId}</Typography.Title>
      <Tabs
        items={[
          {
            key: "overview",
            label: "Обзор",
            children: project ? (
              <Card title="Детали проекта">
                <Descriptions column={1} bordered>
                  <Descriptions.Item label="Название">{project.name}</Descriptions.Item>
                  <Descriptions.Item label="Описание">{project.description || "-"}</Descriptions.Item>
                  <Descriptions.Item label="ID идеи">{project.idea_id ?? "-"}</Descriptions.Item>
                  <Descriptions.Item label="Создатель">{project.creator_email || "-"}</Descriptions.Item>
                </Descriptions>
              </Card>
            ) : (
              <Empty description="Данные проекта пока недоступны" />
            )
          },
          {
            key: "chat",
            label: "Чат",
            children: (
              <Card>
                <Button type="primary">
                  <Link to={`/projects/${projectId}/chat`}>Открыть чат проекта</Link>
                </Button>
              </Card>
            )
          },
          {
            key: "members",
            label: "Участники",
            children: (
              <Card title="Участники">
                <div className="page-toolbar">
                  <Typography.Text>Участников: {members.length}</Typography.Text>
                  <Space>
                    <Button onClick={loadMembers}>Обновить</Button>
                    <Button onClick={onLeave} danger>Покинуть проект</Button>
                  </Space>
                </div>
                <List
                  dataSource={members}
                  locale={{
                    emptyText: (
                      <div className="empty-panel">
                        <Empty description="Пока нет участников" />
                      </div>
                    )
                  }}
                  renderItem={(item) => (
                    <List.Item>
                      <div>
                        <div>ID: {item.user_id}</div>
                        <div>Role: {item.role || "-"}</div>
                      </div>
                    </List.Item>
                  )}
                />
                <Form layout="inline" onFinish={onInvite}>
                  <Form.Item label="ID пользователя" name="user_id" rules={[{ required: true }]}>
                    <InputNumber min={1} />
                  </Form.Item>
                  <Form.Item label="Роль" name="role">
                    <Input />
                  </Form.Item>
                  <Button type="primary" htmlType="submit">Пригласить</Button>
                </Form>
                <Form layout="inline" onFinish={onRemove}>
                  <Form.Item label="ID пользователя" name="user_id" rules={[{ required: true }]}>
                    <InputNumber min={1} />
                  </Form.Item>
                  <Button danger htmlType="submit">Удалить</Button>
                </Form>
              </Card>
            )
          }
        ]}
      />
    </div>
  );
}
