import { Button, Card, Form, Input, Select, Typography, message } from "antd";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();

  const onFinish = async (values: { email: string; username: string; password: string; role: "specialist" | "company" }) => {
    try {
      await register(values);
      message.success("Регистрация успешна");
      navigate("/login");
    } catch {
      message.error("Не удалось зарегистрироваться");
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" title="Регистрация">
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="Почта" name="email" rules={[{ required: true }]}> 
            <Input type="email" placeholder="name@example.com" />
          </Form.Item>
          <Form.Item label="Имя пользователя" name="username" rules={[{ required: true }]}> 
            <Input placeholder="Например, anna.dev" />
          </Form.Item>
          <Form.Item label="Пароль" name="password" rules={[{ required: true, min: 8 }]}> 
            <Input.Password />
          </Form.Item>
          <Form.Item label="Роль" name="role" rules={[{ required: true }]}> 
            <Select
              options={[
                { value: "specialist", label: "Специалист" },
                { value: "company", label: "Компания" }
              ]}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Создать аккаунт
          </Button>
        </Form>
        <Typography.Paragraph className="mt-4">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
