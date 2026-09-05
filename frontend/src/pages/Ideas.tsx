import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select, Table, Typography, message, Tag, Empty } from "antd";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Idea } from "../types";

export function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchIdeas = async (status?: string) => {
    setLoading(true);
    try {
      const { data } = await api.get<Idea[]>("/ideas", { params: { status } });
      setIdeas(data.filter((idea) => idea.status !== "closed"));
    } catch {
      message.error("Не удалось загрузить идеи");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIdeas();
  }, []);

  const filteredIdeas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return ideas;
    }
    return ideas.filter((idea) => idea.title.toLowerCase().includes(term) || idea.short_description.toLowerCase().includes(term));
  }, [ideas, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="page-toolbar">
        <Typography.Title level={2}>Идеи</Typography.Title>
        <Button type="primary">
          <Link to="/ideas/new">Создать идею</Link>
        </Button>
      </div>

      <Card title="Список идей">
        <div className="page-filters mb-4">
          <Select
            placeholder="Статус"
            allowClear
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value || undefined);
              fetchIdeas(value || undefined);
            }}
            options={[
              { value: "open", label: "Открыта" },
              { value: "in_progress", label: "В работе" }
            ]}
          />
          <Input
            placeholder="Поиск по идеям"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredIdeas}
          locale={{
            emptyText: (
              <div className="empty-panel">
                <Empty description="Пока нет идей" />
              </div>
            )
          }}
          columns={[
            { title: "ID", dataIndex: "id", width: 80 },
            {
              title: "Название",
              dataIndex: "title",
              render: (_: string, record: Idea) => <Link to={`/ideas/${record.id}`}>{record.title}</Link>
            },
            {
              title: "Статус",
              dataIndex: "status",
              render: (value: string) => (
                <Tag className="status-tag" color={value === "open" ? "green" : "blue"}>
                  {value.replace(/_/g, " ")}
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
