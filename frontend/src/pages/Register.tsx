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
    <div className="min-h-[70vh] flex items-center justify-center">
      <Card className="max-w-md w-full" title="Регистрация">
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="Email" name="email" rules={[{ required: true }]}> 
            <Input type="email" />
          </Form.Item>
          <Form.Item label="Username" name="username" rules={[{ required: true }]}> 
            <Input />
          </Form.Item>
          <Form.Item label="Пароль" name="password" rules={[{ required: true, min: 8 }]}> 
            <Input.Password />
          </Form.Item>
          <Form.Item label="Роль" name="role" rules={[{ required: true }]}> 
            <Select
              options={[
                { value: "specialist", label: "Specialist" },
                { value: "company", label: "Company" }
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
