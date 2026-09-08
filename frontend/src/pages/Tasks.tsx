import { useEffect, useMemo, useState } from "react";
import { Button, Card, Dropdown, Input, Table, Typography, message, Tag, Empty } from "antd";
import type { MenuProps } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Task } from "../types";
import { useAuthStore } from "../store/auth";

export function TasksPage() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"alphabetical" | "difficulty" | "reward">("alphabetical");

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Task[]>("/tasks");
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

  const visibleTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ru");
    const difficultyOrder: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
    const filteredTasks = normalizedSearch
      ? tasks.filter((task) => {
          const searchableText = [task.title, task.description, task.required_skills]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("ru");
          return searchableText.includes(normalizedSearch);
        })
      : tasks;

    return [...filteredTasks].sort((firstTask, secondTask) => {
      if (sortBy === "difficulty") {
        return (difficultyOrder[firstTask.difficulty || ""] ?? 3) - (difficultyOrder[secondTask.difficulty || ""] ?? 3);
      }

      if (sortBy === "reward") {
        return (firstTask.reward ?? 0) - (secondTask.reward ?? 0);
      }

      return firstTask.title.localeCompare(secondTask.title, "ru", { sensitivity: "base" });
    });
  }, [search, sortBy, tasks]);

  const sortOptions: MenuProps["items"] = [
    { key: "alphabetical", label: "По алфавитному порядку" },
    { key: "difficulty", label: "По сложности" },
    { key: "reward", label: "По награде" }
  ];

  const sortLabels = {
    alphabetical: "По алфавитному порядку",
    difficulty: "По сложности",
    reward: "По награде"
  };

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
          <Dropdown
            menu={{
              items: sortOptions,
              selectedKeys: [sortBy],
              onClick: ({ key }) => setSortBy(key as typeof sortBy)
            }}
            trigger={["click"]}
          >
            <Button>
              Сортировка: {sortLabels[sortBy]} <DownOutlined />
            </Button>
          </Dropdown>
          <Input
            placeholder="Поиск по задачам и навыкам"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={visibleTasks}
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
