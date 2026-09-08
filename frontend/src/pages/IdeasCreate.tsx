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
      <Card title="Описание идеи">
        <Form layout="vertical" onFinish={onCreate}>
          <Form.Item label="Название" name="title" rules={[{ required: true }]}>
            <Input placeholder="Например, сервис для учёбы" />
          </Form.Item>
          <Form.Item label="Короткое описание" name="short_description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Суть идеи в 1-2 предложениях" />
          </Form.Item>
          <Form.Item label="Полное описание" name="full_description">
            <Input.TextArea rows={3} placeholder="Подробности, цели, аудитория" />
          </Form.Item>
          <Form.Item label="Нужные роли (через запятую)" name="roles_needed">
            <Input placeholder="Frontend, Backend, Product" />
          </Form.Item>
          <Form.Item label="Теги" name="tags">
            <Input placeholder="edtech, ai, mobile" />
          </Form.Item>
          <Button type="primary" htmlType="submit">Создать</Button>
        </Form>
      </Card>
    </div>
  );
}
