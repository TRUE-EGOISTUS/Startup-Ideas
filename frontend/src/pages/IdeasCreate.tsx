import { Button, Card, Form, Input, Typography, message } from "antd";
import { api } from "../lib/api";

export function IdeasCreatePage() {
  const onCreate = async (values: Record<string, unknown>) => {
    try {
      await api.post("/ideas", values);
      message.success("Идея создана");
    } catch {
      message.error("Не удалось создать идею");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2}>Создать идею</Typography.Title>
      <Card>
        <Form layout="vertical" onFinish={onCreate}>
          <Form.Item label="Название" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Короткое описание" name="short_description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Полное описание" name="full_description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Нужные роли (через запятую)" name="roles_needed">
            <Input />
          </Form.Item>
          <Form.Item label="Теги" name="tags">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit">Создать</Button>
        </Form>
      </Card>
    </div>
  );
}
