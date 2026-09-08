import { useEffect, useState } from "react";
import { Button, Card, Input, Select, Table, Typography, message, Tag, Empty } from "antd";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Task } from "../types";
import { useAuthStore } from "../store/auth";

export function TasksPage() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: "", difficulty: "", search: "" });

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Task[]>("/tasks", {
        params: {
          status: filters.status || undefined,
          difficulty: filters.difficulty || undefined,
          search: filters.search || undefined
        }
      });
      setTasks(data.filter((task) => task.status !== "closed"));
    } catch {
      message.error("Не удалось загрузить задачи");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-toolbar">
        <Typography.Title level={2} className="page-title">Задачи</Typography.Title>
        {user?.role === "company" && (
          <Button type="primary">
            <Link to="/tasks/new">Создать задачу</Link>
          </Button>
        )}
      </div>
      <Card title="Список задач">
        <div className="page-filters mb-4">
          <Select
            placeholder="Статус"
            allowClear
            value={filters.status || undefined}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value || "" }))}
            options={[
              { value: "open", label: "Открыта" },
              { value: "in_progress", label: "В работе" },
              { value: "awaiting_review", label: "На ревью" },
              { value: "ready_for_next", label: "Готова" },
              { value: "reviewing", label: "Проверка" }
            ]}
          />
          <Select
            placeholder="Сложность"
            allowClear
            value={filters.difficulty || undefined}
            onChange={(value) => setFilters((prev) => ({ ...prev, difficulty: value || "" }))}
            options={[
              { value: "easy", label: "Легко" },
              { value: "medium", label: "Средне" },
              { value: "hard", label: "Сложно" }
            ]}
          />
          <Input
            placeholder="Поиск"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          />
          <Button onClick={fetchTasks}>Применить</Button>
        </div>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={tasks}
          locale={{
            emptyText: (
              <div className="empty-panel">
                <Empty description="Пока нет задач" />
              </div>
            )
          }}
          columns={[
            { title: "ID", dataIndex: "id", width: 80 },
            {
              title: "Заголовок",
              dataIndex: "title",
              render: (_: string, record: Task) => <Link to={`/tasks/${record.id}`}>{record.title}</Link>
            },
            {
              title: "Статус",
              dataIndex: "status",
              render: (value: string) => (
                <Tag
                  className="status-tag"
                  color={value === "open" ? "green" : value === "in_progress" ? "blue" : value === "awaiting_review" ? "gold" : "default"}
                >
                  {value.replace(/_/g, " ")}
                </Tag>
              )
            },
            {
              title: "Режим",
              dataIndex: "execution_mode",
              render: (value?: string) => <Tag>{value || "classic"}</Tag>
            },
            {
              title: "Награда",
              dataIndex: "reward",
              render: (value?: number | null) => (value ? `${value} ₽` : "-")
            }
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
