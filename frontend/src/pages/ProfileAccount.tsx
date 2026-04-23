import { Button, Card, Form, Input, Typography, message } from "antd";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

export function ProfileAccountPage() {
  const { user, loadMe, refresh } = useAuthStore();

  const onUpdateMe = async (values: { email?: string; username?: string }) => {
    try {
      await api.put("/users/me", values);
      message.success("Профиль обновлен");
      loadMe();
    } catch {
      message.error("Не удалось обновить профиль");
    }
  };

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
      <Typography.Title level={2}>Аккаунт</Typography.Title>

      <Card title="Мой аккаунт">
        <div>Email: {user?.email || "-"}</div>
        <div>Role: {user?.role || "-"}</div>
        <div>Username: {user?.username || "-"}</div>
        <Button className="mt-2" onClick={() => refresh()}>
          Обновить токен
        </Button>
      </Card>

      <Card title="Обновить email/username">
        <Form layout="vertical" onFinish={onUpdateMe}>
          <Form.Item label="Email" name="email">
            <Input type="email" />
          </Form.Item>
          <Form.Item label="Username" name="username">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit">Сохранить</Button>
        </Form>
      </Card>

      <Card title="Смена пароля">
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
