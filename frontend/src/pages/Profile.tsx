import { useEffect, useState } from "react";
import { Avatar, Button, Card, Col, Divider, Form, Input, Progress, Row, Tag, Typography, Upload, message } from "antd";
import { CameraOutlined, LockOutlined, MailOutlined, SaveOutlined, UserOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

type ProfileData = {
  skills?: string | null;
  rating?: number;
  github_url?: string | null;
  portfolio?: string | null;
  company_name?: string | null;
  description?: string | null;
  contact_info?: string | null;
  avatar_url?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
};

export function ProfilePage() {
  const { user, loadMe } = useAuthStore();
  const [profile, setProfile] = useState<ProfileData>({});
  const [loading, setLoading] = useState(false);
  const [accountForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const apiBaseUrl = api.defaults.baseURL ?? "http://localhost:8000";
  const profileImage = profile.avatar_url || profile.logo_url;
  const coverImage = profile.cover_url;
  const profileCompletion = user?.role === "specialist"
    ? [user.username, profile.skills, profile.github_url, profile.portfolio, profileImage].filter(Boolean).length * 20
    : [user?.username, profile.company_name, profile.description, profile.contact_info, profileImage].filter(Boolean).length * 20;

  useEffect(() => {
    if (!user) {
      return;
    }
    accountForm.setFieldsValue({ email: user.email, username: user.username });
    setLoading(true);
    api.get<ProfileData>("/users/me/profile")
      .then(({ data }) => {
        setProfile(data);
        profileForm.setFieldsValue(data);
      })
      .catch(() => message.error("Не удалось загрузить профиль"))
      .finally(() => setLoading(false));
  }, [accountForm, profileForm, user]);

  const saveAccount = async (values: { email: string; username: string }) => {
    try {
      await api.put("/users/me", values);
      await loadMe();
      message.success("Данные аккаунта сохранены");
    } catch {
      message.error("Не удалось сохранить данные аккаунта");
    }
  };

  const saveProfile = async (values: ProfileData) => {
    if (!user) return;
    const path = user.role === "specialist" ? "/users/me/profile/specialist" : "/users/me/profile/company";
    try {
      const { data } = await api.put<ProfileData>(path, values);
      setProfile(data);
      message.success("Профиль сохранен");
    } catch {
      message.error("Не удалось сохранить профиль");
    }
  };

  const makeUploadProps = (imageType: "avatar" | "cover"): UploadProps => ({
    showUploadList: false,
    beforeUpload: async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      try {
        formData.append("image_type", imageType);
        const { data } = await api.post<{ image_url: string }>("/users/me/avatar", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        setProfile((current) => imageType === "avatar"
          ? ({ ...current, avatar_url: data.image_url, logo_url: data.image_url })
          : ({ ...current, cover_url: data.image_url }));
        message.success(imageType === "avatar" ? "Аватар обновлен" : "Фон профиля обновлен");
      } catch {
        message.error("Не удалось загрузить изображение");
      }
      return false;
    }
  });

  return (
    <div className="profile-page space-y-6">
      <div className="profile-heading">
        <div>
          <Typography.Title level={2} className="page-title">Мой профиль</Typography.Title>
          <Typography.Text className="profile-heading-copy">Настройте профиль, чтобы вас было проще найти в проектах.</Typography.Text>
        </div>
        <Tag color={user?.role === "company" ? "gold" : "cyan"}>{user?.role === "company" ? "Компания" : "Специалист"}</Tag>
      </div>

      <Card className="profile-hero" loading={loading}>
        <div className="profile-cover">
          {coverImage && <img src={`${apiBaseUrl}${coverImage}`} alt="Фон профиля" />}
          <div className="profile-cover-shade" />
          <Upload {...makeUploadProps("cover")} accept="image/jpeg,image/png">
            <Button className="profile-cover-button" icon={<CameraOutlined />}>Изменить фон</Button>
          </Upload>
        </div>
        <div className="profile-hero-content">
          <div className="profile-identity">
            <Upload {...makeUploadProps("avatar")} accept="image/jpeg,image/png">
              <div className="profile-avatar-upload" title="Изменить аватар">
                <Avatar size={112} src={profileImage ? `${apiBaseUrl}${profileImage}` : undefined} icon={<UserOutlined />} />
                <span><CameraOutlined /></span>
              </div>
            </Upload>
            <div className="profile-identity-text">
              <Typography.Title level={3} className="profile-name">{user?.username || "Новый пользователь"}</Typography.Title>
              <Typography.Text className="profile-email"><MailOutlined /> {user?.email}</Typography.Text>
              <div className="profile-meta"><Tag>{user?.role === "company" ? profile.company_name || "Название компании не указано" : profile.skills || "Навыки пока не указаны"}</Tag></div>
            </div>
          </div>
          <div className="profile-progress-wrap">
            <div className="profile-progress">
              <Typography.Text strong>Заполненность профиля</Typography.Text>
              <Progress percent={profileCompletion} strokeColor="#00b98a" />
              <Typography.Text type="secondary">Добавьте информацию, чтобы повысить доверие.</Typography.Text>
            </div>
          </div>
        </div>
      </Card>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={15}>
          <Card title="Основная информация" extra={<UserOutlined />}>
            <Form layout="vertical" form={accountForm} onFinish={saveAccount}>
              <Row gutter={16}>
                <Col xs={24} md={12}><Form.Item label="Имя пользователя" name="username" rules={[{ required: true }]}><Input /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item label="Почта" name="email" rules={[{ required: true, type: "email" }]}><Input /></Form.Item></Col>
              </Row>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Сохранить изменения</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="Безопасность" extra={<LockOutlined />}>
            <Typography.Text type="secondary">Пароль защищает доступ к аккаунту.</Typography.Text>
            <Divider />
            <Button href="/profile/password">Изменить пароль</Button>
          </Card>
        </Col>
      </Row>

      <Card title={user?.role === "company" ? "О компании" : "Профессиональный профиль"}>
        <Form layout="vertical" form={profileForm} onFinish={saveProfile}>
          {user?.role === "company" ? (
            <Row gutter={16}>
              <Col xs={24} md={12}><Form.Item label="Название компании" name="company_name"><Input placeholder="Название вашей компании" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Контакты" name="contact_info"><Input placeholder="Телеграм, почта, сайт" /></Form.Item></Col>
              <Col span={24}><Form.Item label="Описание" name="description"><Input.TextArea rows={4} placeholder="Чем занимается компания" /></Form.Item></Col>
            </Row>
          ) : (
            <Row gutter={16}>
              <Col span={24}><Form.Item label="Навыки" name="skills"><Input placeholder="React, UI/UX, Python" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="GitHub" name="github_url"><Input placeholder="https://github.com/username" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Портфолио" name="portfolio"><Input placeholder="Ссылка на портфолио" /></Form.Item></Col>
            </Row>
          )}
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Сохранить профиль</Button>
        </Form>
      </Card>
    </div>
  );
}
