import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom"; // добавлен Link
import { Button, Card, Descriptions, Form, Input, List, Select, Space, Tag, Typography, message, Tabs, Empty } from "antd";
import { api } from "../lib/api";
import { Idea, IdeaResponse } from "../types";
import { useAuthStore } from "../store/auth";

export function IdeaDetailPage() {
  const { ideaId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [responses, setResponses] = useState<IdeaResponse[]>([]);
  const [section, setSection] = useState<"details" | "update" | "status" | "respond" | "responses" | "danger">("details");
  const [hasProjects, setHasProjects] = useState(false);
  const [updateForm] = Form.useForm();
  const canRespond = useMemo(() => {
    if (!user || !idea) return false;
    return !hasProjects && user.id !== idea.author_id;
  }, [hasProjects, user, idea]);
  const roleOptions = useMemo(() => {
    if (!idea?.roles_needed) return [];
    return idea.roles_needed
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean)
      .map((role) => ({ value: role, label: role }));
  }, [idea?.roles_needed]);

  const loadIdea = async () => {
    if (!ideaId) return;
    try {
      const { data } = await api.get<Idea>(`/ideas/${ideaId}`);
      setIdea(data);
    } catch {
      message.error("Не удалось загрузить идею");
    }
  };

  const loadResponses = async () => {
    if (!ideaId) return;
    try {
      const { data } = await api.get<IdeaResponse[]>(`/ideas/${ideaId}/responses`);
      setResponses(data);
    } catch {
      message.error("Не удалось загрузить отклики");
    }
  };

  useEffect(() => {
    loadIdea();
    if (user) {
      api.get("/ideas/projects/my")
        .then(({ data }) => setHasProjects(Array.isArray(data) && data.length > 0))
        .catch(() => setHasProjects(false));
    } else {
      setHasProjects(false);
    }
  }, [ideaId, user?.id]);

  useEffect(() => {
    if (!idea) return;
    updateForm.setFieldsValue({
      title: idea.title,
      short_description: idea.short_description,
      roles_needed: idea.roles_needed,
      tags: idea.tags
    });
  }, [idea, updateForm]);

  const onUpdate = async (values: Record<string, unknown>) => {
    if (!ideaId) return;
    try {
      await api.put(`/ideas/${ideaId}`, values);
      message.success("Идея обновлена");
      loadIdea();
    } catch {
      message.error("Не удалось обновить идею");
    }
  };

  const onDelete = async () => {
    if (!ideaId) return;
    try {
      await api.delete(`/ideas/${ideaId}`);
      message.success("Идея удалена");
      navigate("/ideas");
    } catch {
      message.error("Не удалось удалить идею");
    }
  };

  const onUpdateStatus = async (values: { status: string }) => {
    if (!ideaId) return;
    try {
      await api.put(`/ideas/${ideaId}/status`, null, { params: { status: values.status } });
      message.success("Статус обновлен");
      if (values.status === "closed") {
        message.success("Идея и связанные проекты удалены");
        navigate("/ideas");
      } else {
        loadIdea();
      }
    } catch {
      message.error("Не удалось обновить статус");
    }
  };

  const onUpdateRoles = async (values: { roles_needed: string }) => {
    if (!ideaId) return;
    try {
      await api.put(`/ideas/${ideaId}/roles`, null, { params: { roles_needed: values.roles_needed } });
      message.success("Роли обновлены");
      loadIdea();
    } catch {
      message.error("Не удалось обновить роли");
    }
  };

  const onRespond = async (values: { role: string; message?: string }) => {
    if (!ideaId) return;
    try {
      await api.post(`/ideas/${ideaId}/interest`, values);
      message.success("Отклик отправлен");
      loadIdea();
    } catch {
      message.error("Не удалось отправить отклик");
    }
  };

  const onWithdraw = async () => {
    if (!ideaId) return;
    try {
      await api.delete(`/ideas/${ideaId}/interest`);
      message.success("Отклик отозван");
      loadIdea();
    } catch {
      message.error("Не удалось отозвать отклик");
    }
  };

  const onAcceptResponse = async (responseId: number) => {
    if (!ideaId) return;
    try {
      await api.put(`/ideas/${ideaId}/responses/${responseId}/accept`);
      message.success("Отклик принят");
      loadResponses();
    } catch {
      message.error("Не удалось принять отклик");
    }
  };

  const onRejectResponse = async (responseId: number) => {
    if (!ideaId) return;
    try {
      await api.put(`/ideas/${ideaId}/responses/${responseId}/reject`);
      message.success("Отклик отклонен");
      loadResponses();
    } catch {
      message.error("Не удалось отклонить отклик");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2} className="page-title">Идея #{ideaId}</Typography.Title>
      <Tabs
        activeKey={section}
        onChange={(key) => setSection(key as typeof section)}
        items={[
          { key: "details", label: "Детали" },
          { key: "update", label: "Редактировать" },
          { key: "status", label: "Статус и роли" },
          ...(canRespond ? [{ key: "respond", label: "Откликнуться" }] : []),
          { key: "responses", label: "Отклики" },
          { key: "danger", label: "Удаление" }
        ]}
      />
      {section === "details" && idea && (
        <Card title="Детали">
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Название">{idea.title}</Descriptions.Item>
            <Descriptions.Item label="Статус">
              <Tag color={idea.status === "open" ? "green" : idea.status === "in_progress" ? "blue" : "red"}>
                {idea.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Короткое описание">{idea.short_description}</Descriptions.Item>
            <Descriptions.Item label="Создатель">
              <Link to={`/profile/${idea.author_id}`}>{idea.author_email || "-"}</Link>
            </Descriptions.Item>
            <Descriptions.Item label="Роли">{idea.roles_needed || "-"}</Descriptions.Item>
            <Descriptions.Item label="Теги">{idea.tags || "-"}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {section === "update" && (
        <Card title="Обновить идею">
          <Form layout="vertical" onFinish={onUpdate} form={updateForm}>
            <Form.Item label="Название" name="title"><Input /></Form.Item>
            <Form.Item label="Короткое описание" name="short_description"><Input.TextArea rows={2} /></Form.Item>
            <Form.Item label="Роли (через запятую)" name="roles_needed"><Input /></Form.Item>
            <Form.Item label="Теги" name="tags"><Input /></Form.Item>
            <Button type="primary" htmlType="submit">Сохранить</Button>
          </Form>
        </Card>
      )}

      {section === "status" && (
        <Card title="Статус и роли">
          <Space direction="vertical" className="w-full">
            <Form layout="inline" onFinish={onUpdateStatus}>
              <Form.Item label="Статус" name="status" rules={[{ required: true }]}>
                <Select options={[
                  { value: "open", label: "open" },
                  { value: "in_progress", label: "in_progress" },
                  { value: "closed", label: "closed" }
                ]} />
              </Form.Item>
              <Button type="primary" htmlType="submit">Обновить</Button>
            </Form>
            <Form layout="inline" onFinish={onUpdateRoles}>
              <Form.Item label="Роли" name="roles_needed" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Button type="primary" htmlType="submit">Обновить</Button>
            </Form>
          </Space>
        </Card>
      )}

      {section === "respond" && canRespond && (
        <Card title="Откликнуться на идею">
          <Form layout="vertical" onFinish={onRespond}>
            <Form.Item
              label="Роль"
              name="role"
              rules={[{ required: true }]}
              help={roleOptions.length === 0 ? "Автор не указал роли для откликов" : undefined}
            >
              <Select
                placeholder="Выберите роль"
                options={roleOptions}
                disabled={roleOptions.length === 0}
              />
            </Form.Item>
            <Form.Item label="Сообщение" name="message">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" disabled={roleOptions.length === 0}>Отправить</Button>
              <Button onClick={onWithdraw}>Отозвать отклик</Button>
            </Space>
          </Form>
        </Card>
      )}

      {section === "responses" && (
        <Card title="Отклики">
          <div className="page-toolbar">
            <Typography.Text>Всего откликов: {responses.length}</Typography.Text>
            <Button onClick={loadResponses}>Обновить</Button>
          </div>
          <List
            dataSource={responses}
            locale={{ emptyText: <div className="empty-panel"><Empty description="Откликов пока нет" /></div> }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="accept" type="primary" onClick={() => onAcceptResponse(item.id)}>Принять</Button>,
                  <Button key="reject" danger onClick={() => onRejectResponse(item.id)}>Отклонить</Button>
                ]}
              >
                <List.Item.Meta
                  title={<Link to={`/profile/${item.user_id}`}>User {item.user_id} · {item.role}</Link>}
                  description={item.message || "Сообщение не указано"}
                />
                <Tag className="status-tag">{item.status}</Tag>
              </List.Item>
            )}
          />
        </Card>
      )}

      {section === "danger" && (
        <Card title="Удалить идею">
          <Button danger onClick={onDelete}>Удалить</Button>
        </Card>
      )}
    </div>
  );
}