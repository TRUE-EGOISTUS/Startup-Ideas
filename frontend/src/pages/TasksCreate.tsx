import { useEffect, useState } from "react";
import { Button, Card, Form, Input, InputNumber, Select, Table, Typography, message } from "antd";
import { api } from "../lib/api";
import { Task } from "../types";
import { useAuthStore } from "../store/auth";

export function TasksCreatePage() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const executionMode = Form.useWatch("execution_mode", form) as string | undefined;

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Task[]>("/tasks");
      const ownTasks = user ? data.filter((task) => task.author_id === user.id) : [];
      setTasks(ownTasks);
    } catch {
      message.error("Не удалось загрузить задачи");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user?.id]);

  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api.post("/tasks", values);
      message.success("Задача создана");
      form.resetFields();
      fetchTasks();
    } catch {
      message.error("Не удалось создать задачу");
    }
  };

  if (user?.role !== "company") {
    return (
      <Card>
        <Typography.Text>Создание задач доступно только компаниям.</Typography.Text>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Typography.Title level={2}>Создание задачи</Typography.Title>
      <Card title="Новая задача">
        <Form layout="vertical" onFinish={onCreate} form={form} initialValues={{ execution_mode: "classic", visibility: "public" }}>
          <Form.Item label="Заголовок" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Описание" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Награда" name="reward">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item label="Видимость" name="visibility">
            <Select options={[{ value: "public", label: "public" }, { value: "private", label: "private" }]} />
          </Form.Item>
          <Form.Item label="Режим выполнения" name="execution_mode">
            <Select options={[{ value: "classic", label: "classic" }, { value: "open", label: "open" }]} />
          </Form.Item>
          {executionMode !== "classic" && (
            <Form.Item label="Дедлайн (MSK)" name="deadline">
              <Input type="datetime-local" />
            </Form.Item>
          )}
          <Form.Item label="Навыки" name="required_skills">
            <Input />
          </Form.Item>
          <Form.Item label="Сложность" name="difficulty">
            <Input />
          </Form.Item>
          {executionMode !== "open" && (
            <Form.Item label="Срок для исполнителя (минуты)" name="executor_deadline_minutes">
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit">Создать</Button>
        </Form>
      </Card>

      <Card title="Мои задачи">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={tasks}
          columns={[
            { title: "ID", dataIndex: "id", width: 80 },
            { title: "Заголовок", dataIndex: "title" },
            { title: "Статус", dataIndex: "status" },
            { title: "Режим", dataIndex: "execution_mode" }
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
