import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Descriptions,
  Empty,
  List,
  Modal,
  Select,
  Space,
  Tag,
  Tabs,
  Typography,
  message
} from "antd";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import type { Project, ProjectMember } from "../types";

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const loadProject = async () => {
    if (!projectId) return;
    try {
      const { data } = await api.get<Project>(`/ideas/projects/${projectId}`);
      setProject(data);
    } catch {
      message.error("Не удалось загрузить проект");
    }
  };

  const loadMembers = async () => {
    if (!projectId) return;
    setLoadingMembers(true);
    try {
      const { data } = await api.get<ProjectMember[]>(`/ideas/projects/${projectId}/members`);
      setMembers(data);
      setIsMember(true);
    } catch {
      setMembers([]);
      setIsMember(false);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    setIsMember(false);
    void loadProject();
    void loadMembers();
  }, [projectId]);

  const isAuthor = project?.created_by === user?.id;

  const onLeave = () => {
    if (!projectId) return;
    Modal.confirm({
      title: "Покинуть проект?",
      content: "После выхода доступ к чату и участникам проекта будет закрыт.",
      okText: "Покинуть",
      cancelText: "Отмена",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/ideas/projects/${projectId}/members/me`);
          message.success("Вы вышли из проекта");
          navigate("/projects");
        } catch {
          message.error("Не удалось выйти из проекта");
        }
      }
    });
  };

  const onRemove = (userId: number) => {
    if (!projectId) return;
    Modal.confirm({
      title: "Удалить участника?",
      content: "Пользователь потеряет доступ к проекту и его чату.",
      okText: "Кикнуть с проекта",
      cancelText: "Отмена",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/ideas/projects/${projectId}/members/${userId}`);
          message.success("Участник удален");
          await loadMembers();
        } catch {
          message.error("Не удалось удалить участника");
        }
      }
    });
  };

  const onRoleChange = async (member: ProjectMember, role: string) => {
    if (!projectId) return;
    if (!role || role === member.role) return;
    try {
      await api.patch(`/ideas/projects/${projectId}/members/${member.user_id}/role`, null, { params: { role } });
      message.success("Роль участника обновлена");
      await loadMembers();
    } catch {
      message.error("Не удалось изменить роль");
    }
  };

  const onDeleteRole = (role: string, accountType: "specialist" | "company") => {
    if (!projectId) return;
    Modal.confirm({
      title: "Удалить роль?",
      content: `Роль «${role}» будет удалена из списка ролей ${accountType === "company" ? "компаний" : "специалистов"}.`,
      okText: "Удалить",
      cancelText: "Отмена",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/ideas/projects/${projectId}/roles`, { params: { role, account_type: accountType } });
          message.success("Роль удалена");
          await loadProject();
        } catch {
          message.error("Нельзя удалить роль, если она назначена участнику");
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

  const roleOptions = (member: ProjectMember) => {
    const configuredRoles = (member.user_role === "company"
      ? (project?.roles_companies ?? (project?.roles_specialists == null ? project?.roles_needed : "") ?? "")
      : (project?.roles_specialists ?? (project?.roles_companies == null ? project?.roles_needed : "") ?? ""))
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
    const roles = Array.from(new Set([...configuredRoles, member.role || "member"]));
    return roles.map((role) => ({ value: role, label: role }));
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2} className="page-title">{project?.name || "Проект"}</Typography.Title>
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
                  <Descriptions.Item label="Роли специалистов">
                    {roleTags(project.roles_specialists || project.roles_needed, "specialist")}
                  </Descriptions.Item>
                  <Descriptions.Item label="Роли компаний">
                    {roleTags(project.roles_companies, "company")}
                  </Descriptions.Item>
                  <Descriptions.Item label="Теги">{project.tags || "-"}</Descriptions.Item>
                  <Descriptions.Item label="Создатель">
                    <Link to={`/profile/${project.created_by}`}>{project.creator_email || "-"}</Link>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ) : <Empty description="Данные проекта пока недоступны" />
          },
          ...(isMember ? [{
            key: "chat",
            label: "Чат",
            children: <Card><Button type="primary"><Link to={`/projects/${projectId}/chat`}>Открыть чат проекта</Link></Button></Card>
          }, {
            key: "members",
            label: "Участники",
            children: (
              <Card title="Участники">
                <div className="page-toolbar">
                  <Typography.Text>Участников: {members.length}</Typography.Text>
                  <Space>
                    <Button onClick={() => void loadMembers()} loading={loadingMembers}>Обновить</Button>
                  </Space>
                </div>
                <List
                  dataSource={members}
                  locale={{ emptyText: <div className="empty-panel"><Empty description="Пока нет участников" /></div> }}
                  renderItem={(item) => {
                    const isMemberAuthor = item.user_id === project?.created_by;
                    return (
                      <List.Item
                        actions={isAuthor && !isMemberAuthor ? [
                          <Space key="actions">
                            <Select
                              value={item.role || "member"}
                              options={roleOptions(item)}
                              onChange={(role) => void onRoleChange(item, role)}
                              style={{ width: 180 }}
                            />
                            <Button danger onClick={() => onRemove(item.user_id)}>Кикнуть с проекта</Button>
                          </Space>
                        ] : undefined}
                      >
                        <div>
                          <div>
                            Пользователь: <Link to={`/profile/${item.user_id}`}>{item.username || `Пользователь #${item.user_id}`}</Link>
                          </div>
                          <div>Роль: {item.role || "-"}</div>
                        </div>
                      </List.Item>
                    );
                  }}
                />
              </Card>
            )
          }, {
            key: "settings",
            label: "Настройки",
            children: (
              <Card title="Настройки проекта">
                <Typography.Paragraph type="secondary">
                  Выход из проекта удалит вас из списка участников и закроет доступ к его чату.
                </Typography.Paragraph>
                <Button danger onClick={onLeave}>Покинуть проект</Button>
              </Card>
            )
          }] : [])
        ]}
      />
    </div>
  );
}
