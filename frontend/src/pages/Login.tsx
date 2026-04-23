import { Button, Card, Form, Input, Typography, message } from "antd";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      await login(values.email, values.password);
      message.success("Вы вошли");
      navigate("/");
    } catch {
      message.error("Не удалось войти");
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <Card className="max-w-md w-full" title="Вход">
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="Email" name="email" rules={[{ required: true }]}> 
            <Input type="email" />
          </Form.Item>
          <Form.Item label="Пароль" name="password" rules={[{ required: true }]}> 
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Войти
          </Button>
        </Form>
        <Typography.Paragraph className="mt-4">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
