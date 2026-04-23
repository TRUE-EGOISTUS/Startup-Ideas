import { useEffect, useState } from "react";
import { Button, Card, Input, Select, Table, Typography, message, Space } from "antd";
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
      <Typography.Title level={2}>Задачи</Typography.Title>
      {user?.role === "company" && (
        <Card>
          <Button type="primary">
            <Link to="/tasks/new">Создать задачу</Link>
          </Button>
        </Card>
      )}
      <Card title="Список задач">
        <Space wrap className="mb-4">
          <Select
            placeholder="Статус"
            allowClear
            value={filters.status || undefined}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value || "" }))}
            options={[
              { value: "open", label: "open" },
              { value: "in_progress", label: "in_progress" },
              { value: "awaiting_review", label: "awaiting_review" },
              { value: "ready_for_next", label: "ready_for_next" },
              { value: "reviewing", label: "reviewing" }
            ]}
          />
          <Select
            placeholder="Сложность"
            allowClear
            value={filters.difficulty || undefined}
            onChange={(value) => setFilters((prev) => ({ ...prev, difficulty: value || "" }))}
            options={[
              { value: "easy", label: "easy" },
              { value: "medium", label: "medium" },
              { value: "hard", label: "hard" }
            ]}
          />
          <Input
            placeholder="Поиск"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          />
          <Button onClick={fetchTasks}>Применить</Button>
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={tasks}
          columns={[
            { title: "ID", dataIndex: "id", width: 80 },
            {
              title: "Заголовок",
              dataIndex: "title",
              render: (_: string, record: Task) => <Link to={`/tasks/${record.id}`}>{record.title}</Link>
            },
            { title: "Статус", dataIndex: "status" },
            { title: "Режим", dataIndex: "execution_mode" },
            { title: "Награда", dataIndex: "reward" }
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
