import { Button, Card, Form, Input, Typography, message } from "antd";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading } = useAuthStore();

  const from = location.state?.from;
  const redirectPath = from ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}` : "/";

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      await login(values.email, values.password);
      message.success("Вы вошли");
      navigate(redirectPath, { replace: true });
    } catch {
      message.error("Не удалось войти");
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" title="Вход">
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="Почта" name="email" rules={[{ required: true }]}> 
            <Input type="email" placeholder="name@example.com" />
          </Form.Item>
          <Form.Item label="Пароль" name="password" rules={[{ required: true }]}> 
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Войти
          </Button>
        </Form>
        <Typography.Paragraph className="mt-4">
          Нет аккаунта? <Link to="/register" state={{ from }}>Зарегистрироваться</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
