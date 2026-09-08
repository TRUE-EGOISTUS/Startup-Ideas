import { useEffect } from "react";
import { Button, Card, Form, Input, Typography, message } from "antd";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

type SpecialistProfile = {
  skills?: string | null;
  github_url?: string | null;
  portfolio?: string | null;
};

type CompanyProfile = {
  company_name?: string | null;
  description?: string | null;
  logo_url?: string | null;
  contact_info?: string | null;
};

export function ProfileDetailsPage() {
  const { user } = useAuthStore();
  const [form] = Form.useForm();

  const loadProfile = async () => {
    try {
      const { data } = await api.get<SpecialistProfile | CompanyProfile>("/users/me/profile");
      form.setFieldsValue(data);
    } catch {
      message.error("Не удалось загрузить профиль");
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const onUpdateProfile = async (values: Record<string, unknown>) => {
    if (!user) {
      return;
    }
    const path = user.role === "specialist" ? "/users/me/profile/specialist" : "/users/me/profile/company";
    try {
      await api.put(path, values);
      message.success("Данные обновлены");
      loadProfile();
    } catch {
      message.error("Не удалось обновить данные");
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2} className="page-title">Профильные данные</Typography.Title>
      <Card>
        {user?.role === "company" ? (
          <Form layout="vertical" onFinish={onUpdateProfile} form={form}>
            <Form.Item label="Название компании" name="company_name">
              <Input placeholder="ООО " />
            </Form.Item>
            <Form.Item label="Описание" name="description">
              <Input.TextArea rows={2} placeholder="Чем занимается компания" />
            </Form.Item>
            <Form.Item label="Контакты" name="contact_info">
              <Input placeholder="Телеграм, почта, сайт" />
            </Form.Item>
            <Button type="primary" htmlType="submit">Сохранить</Button>
          </Form>
        ) : user?.role === "specialist" ? (
          <Form layout="vertical" onFinish={onUpdateProfile} form={form}>
            <Form.Item label="Навыки" name="skills">
              <Input placeholder="React, UI/UX, Python" />
            </Form.Item>
            <Form.Item label="GitHub" name="github_url">
              <Input placeholder="https://github.com/username" />
            </Form.Item>
            <Form.Item label="Портфолио" name="portfolio">
              <Input.TextArea rows={2} placeholder="Ссылка на портфолио" />
            </Form.Item>
            <Button type="primary" htmlType="submit">Сохранить</Button>
          </Form>
        ) : (
          <Typography.Text>Профильные данные доступны только для компаний.</Typography.Text>
        )}
      </Card>
    </div>
  );
}
