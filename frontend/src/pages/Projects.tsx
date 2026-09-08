import { useEffect, useState } from "react";
import { Button, Card, Table, Typography, message, Empty } from "antd";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Project } from "../types";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Project[]>("/ideas/projects/my");
      setProjects(data);
    } catch {
      message.error("Не удалось загрузить проекты");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-toolbar">
        <Typography.Title level={2} className="page-title">Мои проекты</Typography.Title>
        <Button onClick={fetchProjects}>Обновить</Button>
      </div>
      <Card>
        <Table
          className="mt-3"
          rowKey="id"
          loading={loading}
          dataSource={projects}
          locale={{
            emptyText: (
              <div className="empty-panel">
                <Empty description="Проекты появятся после набора команды" />
              </div>
            )
          }}
          columns={[
            { title: "ID", dataIndex: "id", width: 80 },
            {
              title: "Название",
              dataIndex: "name",
              render: (_: string, record: Project) => <Link to={`/projects/${record.id}`}>{record.name}</Link>
            },
            { title: "Описание", dataIndex: "description" }
          ]}
        />
      </Card>
    </div>
  );
}
