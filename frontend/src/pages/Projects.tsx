import { useEffect, useMemo, useState } from "react";
import { Button, Card, Dropdown, Input, Table, Typography, message, Tag, Empty, Space } from "antd";
import type { MenuProps } from "antd";
import { CaretDownOutlined, CaretUpOutlined, DownOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Project, ProjectInvite } from "../types";
import { useAuthStore } from "../store/auth";

export function ProjectsPage() {
  const { user } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"alphabetical" | "date">("alphabetical");
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [sortOrder, setSortOrder] = useState<"ascend" | "descend" | null>(null);
  const [invitations, setInvitations] = useState<ProjectInvite[]>([]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Project[]>("/ideas/projects");
      setProjects(data);
    } catch {
      message.error("Не удалось загрузить проекты");
    } finally {
      setLoading(false);
    }
  };

  const fetchInvitations = async () => {
    try {
      const { data } = await api.get<ProjectInvite[]>("/ideas/projects/invitations/my");
      setInvitations(data);
    } catch {
      message.error("Не удалось загрузить приглашения");
    }
  };

  useEffect(() => {
    void fetchProjects();
    void fetchInvitations();
  }, []);

  const respondToInvitation = async (invite: ProjectInvite, action: "accept" | "reject") => {
    try {
      await api.post(`/ideas/projects/${invite.project_id}/invite/${invite.id}/${action}`);
      setInvitations((current) => current.filter((item) => item.id !== invite.id));
      message.success(action === "accept" ? "Вы присоединились к проекту" : "Приглашение отклонено");
      if (action === "accept") void fetchProjects();
    } catch {
      message.error("Не удалось обработать приглашение");
    }
  };

  const visibleProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ru");
    const ownershipFiltered = showOnlyMine
      ? projects.filter((project) => project.created_by === user?.id)
      : projects;
    const filtered = normalizedSearch
      ? ownershipFiltered.filter((project) => [project.name, project.description, project.roles_needed, project.tags]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(normalizedSearch))
      : ownershipFiltered;

    return [...filtered].sort((firstProject, secondProject) => {
      let difference = 0;
      if (sortBy === "date") {
        difference = new Date(firstProject.created_at).getTime() - new Date(secondProject.created_at).getTime();
      } else {
        difference = firstProject.name.localeCompare(secondProject.name, "ru", { sensitivity: "base" });
      }
      return sortOrder === "descend" ? -difference : difference;
    });
  }, [projects, search, showOnlyMine, sortBy, sortOrder, user?.id]);

  const sortOptions: MenuProps["items"] = [
    { key: "alphabetical", label: "По названию" },
    { key: "date", label: "По дате создания" }
  ];

  const sortLabels = {
    alphabetical: "По названию",
    date: "По дате создания"
  };

  return (
    <div className="space-y-6">
      <div className="page-toolbar">
        <Typography.Title level={2} className="page-title">Все проекты</Typography.Title>
      </div>

      {invitations.length > 0 && (
        <Card title="Входящие приглашения">
          <Space direction="vertical" style={{ width: "100%" }}>
            {invitations.map((invite) => (
              <Card key={invite.id} size="small">
                <Space wrap>
                  <Typography.Text>
                    {invite.inviter_username || "Пользователь"} приглашает вас в проект «{invite.project_name || "Без названия"}»
                  </Typography.Text>
                  <Typography.Text type="secondary">Роль: {invite.role || "участник"}</Typography.Text>
                  <Button type="primary" size="small" onClick={() => void respondToInvitation(invite, "accept")}>Принять</Button>
                  <Button danger size="small" onClick={() => void respondToInvitation(invite, "reject")}>Отклонить</Button>
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      )}

      <Card
        title="Список проектов"
        extra={
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span>Сортировка:</span>
            <Button
              type="text"
              size="small"
              icon={<CaretUpOutlined />}
              style={{ color: sortOrder === "ascend" ? "#1677ff" : undefined }}
              onClick={() => setSortOrder(sortOrder === "ascend" ? null : "ascend")}
              title="По возрастанию"
            />
            <Button
              type="text"
              size="small"
              icon={<CaretDownOutlined />}
              style={{ color: sortOrder === "descend" ? "#1677ff" : undefined }}
              onClick={() => setSortOrder(sortOrder === "descend" ? null : "descend")}
              title="По убыванию"
            />
          </div>
        }
      >
        <div className="page-filters mb-4">
          <Dropdown
            menu={{
              items: sortOptions,
              selectedKeys: [sortBy],
              onClick: ({ key }) => setSortBy(key as typeof sortBy)
            }}
            trigger={["click"]}
          >
            <Button>Фильтр: {sortLabels[sortBy]} <DownOutlined /></Button>
          </Dropdown>
          <Input
            placeholder="Поиск по проектам"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {user && (
            <Button type={showOnlyMine ? "primary" : "default"} onClick={() => setShowOnlyMine((value) => !value)}>
              Мои проекты
            </Button>
          )}
        </div>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={visibleProjects}
          locale={{
            emptyText: (
              <div className="empty-panel">
                <Empty description="Проекты появятся после набора команды" />
              </div>
            )
          }}
          columns={[
            { title: "ID", dataIndex: "display_id", width: 80 },
            {
              title: "Название",
              dataIndex: "name",
              render: (_: string, record: Project) => <Link to={`/projects/${record.id}`}>{record.name}</Link>
            },
            {
              title: "Теги",
              dataIndex: "tags",
              render: (value?: string | null) =>
                value
                  ? value.split(",").map((tag) => (
                      <Tag key={tag.trim()}>{tag.trim()}</Tag>
                    ))
                  : "-"
            },
            {
              title: "Роли",
              dataIndex: "roles_needed",
              render: (value?: string | null) => value || "-"
            }
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
