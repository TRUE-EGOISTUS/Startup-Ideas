import { useEffect, useState } from "react";
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
  const [profile, setProfile] = useState<SpecialistProfile | CompanyProfile | null>(null);
  const companyProfile = profile as CompanyProfile | null;

  const loadProfile = async () => {
    try {
      const { data } = await api.get<SpecialistProfile | CompanyProfile>("/users/me/profile");
      setProfile(data);
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
      <Typography.Title level={2}>Профильные данные</Typography.Title>
      <Card>
        {user?.role === "company" ? (
          <Form layout="vertical" onFinish={onUpdateProfile}>
            <Form.Item label="Название компании" name="company_name" initialValue={companyProfile?.company_name}>
              <Input />
            </Form.Item>
            <Form.Item label="Описание" name="description" initialValue={companyProfile?.description}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item label="Контакты" name="contact_info" initialValue={companyProfile?.contact_info}>
              <Input />
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
