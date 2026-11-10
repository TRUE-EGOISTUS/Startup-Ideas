import { Alert, Button, Card, Form, Input, message } from "antd";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function AcceptModeratorInvitationPage() {
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);

  const accept = async (values: { username: string; password: string }) => {
    const token = params.get("token");
    if (!token) {
      message.error("Приглашение недействительно");
      return;
    }
    try {
      await api.post("/users/accept-moderator-invitation", null, {
        params: { token, ...values }
      });
      setDone(true);
    } catch {
      message.error("Не удалось принять приглашение");
    }
  };

  return (
    <div className="auth-page">
      <Card title="Приглашение модератора" className="auth-card">
        {done ? (
          <Alert type="success" message="Приглашение принято" description={<Link to="/login">Войти</Link>} />
        ) : (
          <Form layout="vertical" onFinish={accept}>
            <Form.Item name="username" label="Имя пользователя" rules={[{ required: true, min: 3 }]}>
              <Input />
            </Form.Item>
            <Form.Item name="password" label="Пароль" rules={[{ required: true, min: 8 }]}>
              <Input.Password />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>Создать аккаунт модератора</Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
