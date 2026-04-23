import { Button, Card, Form, Input, Typography, message } from "antd";
import { api } from "../lib/api";

export function ProfilePasswordPage() {
  const onChangePassword = async (values: { old_password: string; new_password: string }) => {
    try {
      await api.post("/users/me/change-password", values);
      message.success("Пароль изменен");
    } catch {
      message.error("Не удалось изменить пароль");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2}>Смена пароля</Typography.Title>
      <Card>
        <Form layout="vertical" onFinish={onChangePassword}>
          <Form.Item label="Текущий пароль" name="old_password" rules={[{ required: true }]}> 
            <Input.Password />
          </Form.Item>
          <Form.Item label="Новый пароль" name="new_password" rules={[{ required: true, min: 8 }]}> 
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit">Сменить</Button>
        </Form>
      </Card>
    </div>
  );
}
