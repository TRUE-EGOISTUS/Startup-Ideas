import { useEffect, useMemo, useState } from "react";
import { Button, Card, Dropdown, Input, Table, Typography, message, Tag, Empty } from "antd";
import type { MenuProps } from "antd";
import { CaretDownOutlined, CaretUpOutlined, DownOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Idea } from "../types";
import { useAuthStore } from "../store/auth";

export function IdeasPage() {
  const { user } = useAuthStore();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"alphabetical" | "responses" | "date">("alphabetical");
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [sortOrder, setSortOrder] = useState<"ascend" | "descend" | null>(null);

  const fetchIdeas = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Idea[]>("/ideas");
      setIdeas(data);
    } catch {
      message.error("Не удалось загрузить идеи");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIdeas();
  }, []);

  const visibleIdeas = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ru");
    const ownershipFiltered = showOnlyMine
      ? ideas.filter((idea) => idea.author_id === user?.id)
      : ideas;
    const filtered = normalizedSearch
      ? ownershipFiltered.filter((idea) => [idea.title, idea.short_description, idea.roles_needed, idea.tags]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(normalizedSearch))
      : ownershipFiltered;

    return [...filtered].sort((firstIdea, secondIdea) => {
      let difference = 0;
      if (sortBy === "responses") {
        difference = firstIdea.responses_count - secondIdea.responses_count;
      } else if (sortBy === "date") {
        difference = new Date(firstIdea.created_at).getTime() - new Date(secondIdea.created_at).getTime();
      } else {
        difference = firstIdea.title.localeCompare(secondIdea.title, "ru", { sensitivity: "base" });
      }
      return sortOrder === "descend" ? -difference : difference;
    });
  }, [ideas, search, showOnlyMine, sortBy, sortOrder, user?.id]);

  const sortOptions: MenuProps["items"] = [
    { key: "alphabetical", label: "По названию" },
    { key: "responses", label: "По откликам" },
    { key: "date", label: "По дате создания" }
  ];

  const sortLabels = {
    alphabetical: "По названию",
    responses: "По откликам",
    date: "По дате создания"
  };

  return (
    <div className="space-y-6">
      <div className="page-toolbar">
        <Typography.Title level={2} className="page-title">Идеи</Typography.Title>
        <Button type="primary">
          <Link to="/ideas/new">Создать идею</Link>
        </Button>
      </div>

      <Card
        title="Список идей"
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
            placeholder="Поиск по идеям"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {user && (
            <Button type={showOnlyMine ? "primary" : "default"} onClick={() => setShowOnlyMine((value) => !value)}>
              Мои идеи
            </Button>
          )}
        </div>
        <Typography.Text type="secondary" className="block mb-3">
          Всего откликов: {visibleIdeas.reduce((total, idea) => total + idea.responses_count, 0)}
        </Typography.Text>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={visibleIdeas}
          locale={{
            emptyText: (
              <div className="empty-panel">
                <Empty description="Пока нет идей" />
              </div>
            )
          }}
          columns={[
            { title: "ID", dataIndex: "display_id", width: 80 },
            {
              title: "Название",
              dataIndex: "title",
              render: (_: string, record: Idea) => <Link to={`/ideas/${record.id}`}>{record.title}</Link>
            },
            {
              title: "Статус",
              dataIndex: "status",
              render: (value: string) => (
                <Tag className="status-tag" color={value === "open" ? "green" : value === "paused" ? "orange" : "blue"}>
                  {value === "open" ? "Открыта" : value === "paused" ? "Приостановлена" : value.replace(/_/g, " ")}
                </Tag>
              )
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
            }
          ]}
        />
      </Card>
    </div>
  );
}
