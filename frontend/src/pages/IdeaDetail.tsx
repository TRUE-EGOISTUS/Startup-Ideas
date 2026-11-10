
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  List,
  Select,
  Space,
  Tag,
  Typography,
  message,
  Tabs,
  Empty,
  Modal,
  Segmented,
  Table,
} from "antd";
import { api } from "../lib/api";
import { Idea, IdeaResponse } from "../types";
import { useAuthStore } from "../store/auth";

export function IdeaDetailPage() {
  const { ideaId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [idea, setIdea] = useState<Idea | null>(null);
  const [responses, setResponses] = useState<IdeaResponse[]>([]);
  const [responsesTab, setResponsesTab] = useState<"all" | "pending" | "accepted">("all");
  const [section, setSection] = useState<
    "details" | "update" | "status" | "respond" | "responses" | "danger"
  >("details");
  const [hasProjects, setHasProjects] = useState(false);

  const [updateForm] = Form.useForm();

  const isAuthor = useMemo(() => {
    if (!user || !idea) return false;
    return user.id === idea.author_id;
  }, [user, idea]);

  const canRespond = useMemo(() => {
    if (!user || !idea) return false;

    // Откликнуться могут только специалисты, которые ещё не состоят
    // ни в одном проекте, и не являются автором идеи.
    // Компаниям и автору идеи этот раздел недоступен.
    return user.role === "specialist" && !isAuthor && !hasProjects;
  }, [hasProjects, user, idea, isAuthor]);

  const roleOptions = useMemo(() => {
    if (!idea?.roles_needed) return [];

    return idea.roles_needed
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean)
      .map((role) => ({
        value: role,
        label: role,
      }));
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

  // Отклики загружаются все сразу при входе в раздел
  // (эндпоинт /responses и так отдаёт 403 всем остальным).
  const loadResponses = async () => {
    if (!ideaId) return;

    try {
      const { data } = await api.get<IdeaResponse[]>(
        `/ideas/${ideaId}/responses`
      );
      setResponses(data);
    } catch {
      message.error("Не удалось загрузить отклики");
    }
  };

  useEffect(() => {
    loadIdea();

    if (user) {
      api
        .get("/ideas/projects/my")
        .then(({ data }) =>
          setHasProjects(Array.isArray(data) && data.length > 0)
        )
        .catch(() => setHasProjects(false));
    } else {
      setHasProjects(false);
    }
  }, [ideaId, user?.id]);

  // Отклики видит и загружает только автор идеи
  // (эндпоинт /responses и так отдаёт 403 всем остальным).
  useEffect(() => {
    if (isAuthor) {
      loadResponses();
    }
  }, [ideaId, isAuthor]);

  // Если активная вкладка стала недоступна
  // (например, идея загрузилась и выяснилось,
  // что пользователь не автор), возвращаемся на "Детали".
  useEffect(() => {
    const authorOnlySections: typeof section[] = [
      "update",
      "status",
      "responses",
      "danger",
    ];

    if (authorOnlySections.includes(section) && !isAuthor) {
      setSection("details");
    }

    if (section === "respond" && !canRespond) {
      setSection("details");
    }
  }, [isAuthor, canRespond, section]);

  useEffect(() => {
    if (!idea) return;

    updateForm.setFieldsValue({
      title: idea.title,
      short_description: idea.short_description,
      roles_needed: idea.roles_needed,
      roles_specialists: idea.roles_specialists,
      roles_companies: idea.roles_companies,
      tags: idea.tags,
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

  const onConvertToProject = async () => {
    if (!ideaId) return;
    try {
      const { data } = await api.post<{ id: string }>(`/ideas/${ideaId}/convert-to-project`);
      message.success("Идея превращена в проект");
      navigate(`/projects/${data.id}`);
    } catch {
      message.error("Не удалось превратить идею в проект");
    }
  };

  const confirmConvertToProject = () => {
    Modal.confirm({
      title: "Превратить идею в проект?",
      content: "Идея будет удалена, а её данные перенесены в новый проект. Это действие нельзя отменить.",
      okText: "Превратить в проект",
      cancelText: "Отмена",
      onOk: onConvertToProject,
    });
  };

  const confirmDelete = () => {
    Modal.confirm({
      title: "Удалить идею?",
      content: "Идея, её отклики и связанные данные будут удалены без возможности восстановления.",
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: onDelete,
    });
  };


  const onUpdateRoles = async (values: {
    roles_needed?: string;
    roles_specialists?: string;
    roles_companies?: string;
  }) => {
    if (!ideaId) return;

    try {
      await api.put(`/ideas/${ideaId}/roles`, null, {
        params: {
          ...(values.roles_needed !== undefined ? { roles_needed: values.roles_needed } : {}),
          ...(values.roles_specialists !== undefined ? { roles_specialists: values.roles_specialists } : {}),
          ...(values.roles_companies !== undefined ? { roles_companies: values.roles_companies } : {}),
        },
      });

      message.success("Роли обновлены");
      loadIdea();
    } catch {
      message.error("Не удалось обновить роли");
    }
  };

  const onDeleteRole = (role: string, accountType: "specialist" | "company") => {
    if (!ideaId) return;
    Modal.confirm({
      title: "Удалить роль?",
      content: `Роль «${role}» будет удалена из списка ролей ${accountType === "company" ? "компаний" : "специалистов"}.`,
      okText: "Удалить",
      cancelText: "Отмена",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/ideas/${ideaId}/roles`, { params: { role, account_type: accountType } });
          message.success("Роль удалена");
          await loadIdea();
        } catch {
          message.error("Не удалось удалить роль");
        }
      }
    });
  };

  const roleTags = (raw: string | null | undefined, accountType: "specialist" | "company") =>
    (raw || "").split(",").map((role) => role.trim()).filter(Boolean).map((role) => (
      <Tag key={role} closable={isAuthor} onClose={() => onDeleteRole(role, accountType)}>
        {role}
      </Tag>
    ));

  const onRespond = async (values: {
    role: string;
    message?: string;
  }) => {
    if (!ideaId) return;

    try {
      await api.post(`/ideas/${ideaId}/interest`, {
        ...values,
        role: values.role.trim(),
      });
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
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (detail === "No response found") {
        message.error("Отклик не найден");
      } else {
        message.error("Не удалось отозвать отклик");
      }
    }
  };

  const onAcceptResponse = async (responseId: number) => {
    if (!ideaId) return;

    try {
      await api.put(
        `/ideas/${ideaId}/responses/${responseId}/accept`
      );

      message.success("Отклик принят");
      loadResponses();
    } catch {
      message.error("Не удалось принять отклик");
    }
  };

  const onRejectResponse = async (responseId: number) => {
    if (!ideaId) return;

    try {
      await api.put(
        `/ideas/${ideaId}/responses/${responseId}/reject`
      );

      message.success("Отклик отклонен");
      loadResponses();
    } catch {
      message.error("Не удалось отклонить отклик");
    }
  };

  const onUnacceptResponse = async (responseId: number) => {
    if (!ideaId) return;

    try {
      await api.put(
        `/ideas/${ideaId}/responses/${responseId}/unaccept`
      );

      message.success("Отклик возвращён в ожидание");
      loadResponses();
    } catch {
      message.error("Не удалось отменить принятие");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2} className="page-title">
        {idea?.title}
      </Typography.Title>

      <Tabs
        activeKey={section}
        onChange={(key) => setSection(key as typeof section)}
        items={[
          { key: "details", label: "Детали" },
          ...(isAuthor
            ? [{ key: "update", label: "Редактировать" }]
            : []),
          ...(isAuthor
            ? [{ key: "status", label: "Статус и роли" }]
            : []),
          ...(canRespond
            ? [{ key: "respond", label: "Откликнуться" }]
            : []),
          ...(isAuthor
            ? [{ key: "responses", label: "Отклики" }]
            : []),
          ...(isAuthor
            ? [{ key: "danger", label: "Удаление" }]
            : []),
        ]}
      />

      {section === "details" && idea && (
        <Card title="Детали">
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Название">
              {idea.title}
            </Descriptions.Item>

            <Descriptions.Item label="Статус">
              <Tag
                color={
                  idea.status === "open" ? "green"
                    : idea.status === "paused" ? "orange"
                    : "default"
                }
              >
                {idea.status === "open" ? "Открыта"
                  : idea.status === "paused" ? "Приостановлена"
                  : idea.status}
              </Tag>
            </Descriptions.Item>

            <Descriptions.Item label="Короткое описание">
              {idea.short_description}
            </Descriptions.Item>

            <Descriptions.Item label="Создатель">
              <Link to={`/profile/${idea.author_id}`}>
                {idea.author_email || "-"}
              </Link>
            </Descriptions.Item>

            <Descriptions.Item label="Роли">
              <Space direction="vertical">
                <span>Специалисты: {roleTags(idea.roles_specialists || idea.roles_needed, "specialist")}</span>
                <span>Компании: {roleTags(idea.roles_companies, "company")}</span>
              </Space>
            </Descriptions.Item>

            <Descriptions.Item label="Теги">
              {idea.tags || "-"}
            </Descriptions.Item>

            <Descriptions.Item label="Отклики">
              {idea.responses_count}
            </Descriptions.Item>

            <Descriptions.Item label="Принято откликов">
              {responses.filter((r) => r.status === "accepted").length}
            </Descriptions.Item>

            {isAuthor && (
              <Descriptions.Item label="Управление откликами">
                <Button type="link" size="small" onClick={() => setSection("responses")}>
                  открыть список откликов
                </Button>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      )}

      {section === "update" && isAuthor && (
        <Card title="Обновить идею">
          <Form
            layout="vertical"
            onFinish={onUpdate}
            form={updateForm}
          >
            <Form.Item label="Название" name="title">
              <Input />
            </Form.Item>

            <Form.Item
              label="Короткое описание"
              name="short_description"
            >
              <Input.TextArea rows={2} />
            </Form.Item>

            <Form.Item label="Роли специалистов (через запятую)" name="roles_specialists">
              <Input placeholder="Frontend, Backend, Product" />
            </Form.Item>

            <Form.Item label="Роли компаний (через запятую)" name="roles_companies">
              <Input placeholder="Инвестор, Партнёр, Заказчик" />
            </Form.Item>

            <Form.Item name="roles_needed" hidden>
              <Input />
            </Form.Item>

            <Form.Item label="Теги" name="tags">
              <Input />
            </Form.Item>

            <Button type="primary" htmlType="submit">
              Сохранить
            </Button>
          </Form>
        </Card>
      )}

      {section === "status" && isAuthor && (
        <Space direction="vertical" size="large" className="w-full">
          <Card title="Статус идеи" size="small">
            {idea && idea.status === "open" && (
              <Button
                onClick={async () => {
                  try {
                    await api.put(`/ideas/${ideaId}/status`, null, {
                      params: { status: "paused" },
                    });
                    message.success("Идея приостановлена");
                    loadIdea();
                  } catch {
                    message.error("Не удалось приостановить идею");
                  }
                }}
              >
                Приостановить
              </Button>
            )}

            {idea && idea.status === "paused" && (
              <Button
                type="primary"
                onClick={async () => {
                  try {
                    await api.put(`/ideas/${ideaId}/status`, null, {
                      params: { status: "open" },
                    });
                    message.success("Идея возобновлена");
                    loadIdea();
                  } catch {
                    message.error("Не удалось возобновить идею");
                  }
                }}
              >
                Возобновить
              </Button>
            )}
          </Card>

          <Card title="Роли" size="small">
            <Typography.Text type="secondary">Нажмите крестик на роли, чтобы удалить ее после подтверждения.</Typography.Text>
            <div style={{ margin: "12px 0" }}>
              <Typography.Text strong>Роли специалистов: </Typography.Text>
              {roleTags(idea?.roles_specialists || idea?.roles_needed, "specialist")}
            </div>
            <div style={{ marginBottom: 12 }}>
              <Typography.Text strong>Роли компаний: </Typography.Text>
              {roleTags(idea?.roles_companies, "company")}
            </div>
            <Form layout="inline" onFinish={onUpdateRoles}>
              <Form.Item
                name="roles_specialists"
                rules={[{ required: true }]}
              >
                <Input
                  style={{ minWidth: 320 }}
                  placeholder="Новые роли специалистов через запятую"
                />
              </Form.Item>

              <Button type="primary" htmlType="submit">
                Сохранить роли специалистов
              </Button>
            </Form>
            <Form layout="inline" onFinish={onUpdateRoles} style={{ marginTop: 12 }}>
              <Form.Item name="roles_companies">
                <Input
                  style={{ minWidth: 320 }}
                  placeholder="Новые роли компаний через запятую"
                />
              </Form.Item>
              <Button type="primary" htmlType="submit">
                Сохранить роли компаний
              </Button>
            </Form>
          </Card>

          <Card title="Конвертация" size="small">
            <Button type="primary" danger onClick={confirmConvertToProject}>
              Превратить идею в проект
            </Button>
          </Card>
        </Space>
      )}

      {section === "respond" && canRespond && (
        <Card title="Откликнуться на идею">
          <Form layout="vertical" onFinish={onRespond}>
            <Form.Item
              label="Роль"
              name="role"
              rules={[{ required: true, message: "Укажите роль" }]}
              help={
                roleOptions.length === 0
                  ? "Автор не указал роли — введите свою роль вручную"
                  : undefined
              }
            >
              {roleOptions.length > 0 ? (
                <Select
                  style={{ minWidth: 260 }}
                  placeholder="Выберите роль"
                  options={roleOptions}
                />
              ) : (
                <Input placeholder="Например: frontend, designer, маркетолог" />
              )}
            </Form.Item>

            <Form.Item label="Сообщение" name="message">
              <Input.TextArea rows={2} />
            </Form.Item>

            <Space>
              <Button type="primary" htmlType="submit">
                Отправить
              </Button>

              <Button onClick={onWithdraw}>
                Отозвать отклик
              </Button>
            </Space>
          </Form>
        </Card>
      )}

      {section === "responses" && isAuthor && (
        <Card title="Отклики">
          <Segmented
            value={responsesTab}
            options={[
              {
                label: "Все",
                value: "all",
              },
              {
                label: `Новые`,
                value: "pending",
              },
              {
                label: `Принятые`,
                value: "accepted",
              },
            ]}
            onChange={(val) => setResponsesTab(val as typeof responsesTab)}
            style={{ marginBottom: 16 }}
          />

          {responsesTab === "all" && idea?.roles_needed && (
            <Table
              dataSource={idea.roles_needed
                .split(",")
                .map((r) => r.trim())
                .filter(Boolean)
                .map((role) => ({
                  role,
                  pending: responses.filter(
                    (r) => r.role.toLowerCase() === role.toLowerCase() && r.status === "pending"
                  ).length,
                  accepted: responses.filter(
                    (r) => r.role.toLowerCase() === role.toLowerCase() && r.status === "accepted"
                  ).length,
                }))
              }
              rowKey="role"
              pagination={false}
              size="small"
              columns={[
                { title: "Роль", dataIndex: "role", key: "role" },
                {
                  title: "Принято",
                  dataIndex: "accepted",
                  key: "accepted",
                  render: (v: number) => (
                    <Tag color="green">{v}</Tag>
                  ),
                },
                {
                  title: "Ожидает",
                  dataIndex: "pending",
                  key: "pending",
                  render: (v: number) => (
                    <Tag color="blue">{v}</Tag>
                  ),
                },
              ]}
            />
          )}

          {responsesTab !== "all" && (
            <>
              <div className="page-toolbar">
                <Typography.Text>
                  Всего откликов: {responses.length}
                </Typography.Text>

                <Button onClick={loadResponses}>
                  Обновить
                </Button>
              </div>

              <List
                dataSource={responses.filter((r) => r.status === responsesTab)}
                locale={{
                  emptyText: (
                    <div className="empty-panel">
                      <Empty description="Нет откликов" />
                    </div>
                  ),
                }}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      ...(item.status === "pending"
                        ? [
                            <Button
                              key="accept"
                              type="primary"
                              onClick={() => onAcceptResponse(item.id)}
                            >
                              Принять
                            </Button>,
                            <Button
                              key="reject"
                              danger
                              onClick={() => onRejectResponse(item.id)}
                            >
                              Отклонить
                            </Button>,
                          ]
                        : [
                            <Button
                              key="unaccept"
                              onClick={() => onUnacceptResponse(item.id)}
                            >
                              Отменить принятие
                            </Button>,
                          ]),
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Link to={`/profile/${item.user_id}`}>
                            {item.user_nickname || `User #${item.user_id}`}
                          </Link>
                          <Tag color="cyan">{item.role}</Tag>
                        </div>
                      }
                      description={
                        item.message || "Сообщение не указано"
                      }
                    />

                    <Tag className="status-tag" color={item.status === "accepted" ? "green" : "blue"}>
                      {item.status === "accepted" ? "Принят" : "Ожидает"}
                    </Tag>
                  </List.Item>
                )}
              />
            </>
          )}
        </Card>
      )}

      {section === "danger" && isAuthor && (
        <Card title="Удалить идею">
          <Button danger onClick={confirmDelete}>
            Удалить
          </Button>
        </Card>
      )}
    </div>
  );
}