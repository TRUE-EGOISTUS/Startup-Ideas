import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Alert, Layout, Menu, Button, Typography, Space, Drawer, Badge, Dropdown, Empty } from "antd";
import {
  HomeOutlined,
  CheckCircleOutlined,
  BulbOutlined,
  TeamOutlined,
  UserOutlined,
  LoginOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
  BellOutlined
} from "@ant-design/icons";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

const { Header, Content } = Layout;

type Notification = {
  id: number;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
};

export function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loadMe, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    api.get<Notification[]>("/notifications").then(({ data }) => setNotifications(data));
  }, [user]);

  const markNotificationRead = async (notification: Notification) => {
    if (!notification.is_read) {
      await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((items) => items.map((item) =>
        item.id === notification.id ? { ...item, is_read: true } : item
      ));
    }
    if (notification.link) navigate(notification.link);
  };

  const notificationMenu = {
    items: [
      ...(notifications.length
        ? notifications.slice(0, 8).map((notification) => ({
          key: String(notification.id),
          label: (
            <div className={notification.is_read ? "notification-item" : "notification-item notification-item--unread"}>
              <Typography.Text strong={!notification.is_read}>{notification.title}</Typography.Text>
              <div>{notification.message}</div>
            </div>
          ),
          onClick: () => markNotificationRead(notification)
        }))
        : [{ key: "empty", disabled: true, label: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет уведомлений" /> }]),
      { type: "divider" as const },
      { key: "all", label: <Link to="/notifications">Все уведомления</Link> }
    ]
  };

  const selectedKey = location.pathname.split("/")[1] || "home";
  const menuItems = useMemo(
    () => [
      { key: "home", icon: <HomeOutlined />, label: <Link to="/">Главная</Link> },
      { key: "tasks", icon: <CheckCircleOutlined />, label: <Link to="/tasks">Задачи</Link> },
      { key: "ideas", icon: <BulbOutlined />, label: <Link to="/ideas">Идеи</Link> },
      { key: "projects", icon: <TeamOutlined />, label: <Link to="/projects">Проекты</Link> },
      { key: "profile", icon: <UserOutlined />, label: <Link to="/profile">Профиль</Link> },
      ...(user?.is_superuser || user?.can_moderate_companies
        ? [{ key: "admin", icon: <SafetyCertificateOutlined />, label: <Link to="/admin/company-verifications">Модерация</Link> }]
        : [])
    ],
    [user?.is_superuser, user?.can_moderate_companies]
  );

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <Layout className="min-h-screen app-shell">
  <Header className="app-header flex items-center justify-between">
  <Space className="app-header-left">
    <Button
      className="app-mobile-toggle"
      icon={<MenuOutlined />}
      onClick={() => setMobileOpen(true)}
      type="text"
    />
    
    {/* Добавляем логотип */}
    <Link to="/" className="app-logo-link">
      <img src="static\uploads\Junion.svg" alt="Junion Logo" className="app-logo-img" />
    </Link>

    {/* Текст JUNION можно оставить рядом или убрать, если логотип самодостаточный */}
    <Typography.Title level={4} className="!mb-0 app-title">
      JUNION
    </Typography.Title>
  </Space>

  <Menu
    mode="horizontal"
    selectedKeys={[selectedKey]}
    items={menuItems}
    className="app-header-menu"
  />
  
  <Space className="app-header-actions">
    {user ? (
      <>
        <Dropdown menu={notificationMenu} trigger={["click"]} placement="bottomRight">
          <Badge count={notifications.filter((notification) => !notification.is_read).length} size="small">
            <Button type="text" icon={<BellOutlined />} aria-label="Уведомления" />
          </Badge>
        </Dropdown>
        <Typography.Text>{user.email}</Typography.Text>
        <Button onClick={handleLogout} danger>
          Выйти
        </Button>
      </>
    ) : (
      <Button className="app-login-button" icon={<LoginOutlined />} type="primary">
        <Link to="/login">Войти</Link>
      </Button>
    )}
  </Space>
</Header>
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        placement="left"
        width={280}
        className="app-mobile-drawer"
      >
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={() => setMobileOpen(false)}
        />
        <div className="app-mobile-actions">
          {user ? (
            <>
              <Dropdown menu={notificationMenu} trigger={["click"]} placement="bottomRight">
                <Badge count={notifications.filter((notification) => !notification.is_read).length} size="small">
                  <Button type="text" icon={<BellOutlined />} aria-label="Уведомления" />
                </Badge>
              </Dropdown>
              <Typography.Text>{user.email}</Typography.Text>
              <Button onClick={handleLogout} danger className="w-full">
                Выйти
              </Button>
            </>
          ) : (
            <Button className="app-login-button w-full" icon={<LoginOutlined />} type="primary">
              <Link to="/login">Войти</Link>
            </Button>
          )}
        </div>
      </Drawer>
      <Content className="app-content">
        <div className={`app-container ${location.pathname.includes("/chat") ? "app-container--chat" : ""}`}>
          {user?.role === "company" && user.verification_status === "pending" && (
            <Alert
              className="mb-6"
              type="warning"
              showIcon
              message="Профиль компании ожидает проверки"
              description="После подтверждения модератором станут доступны создание задач и приглашение специалистов."
            />
          )}
          {user?.role === "company" && user.verification_status === "rejected" && (
            <Alert
              className="mb-6"
              type="error"
              showIcon
              message="Профиль компании отклонен"
              description={user.verification_rejection_reason || "Проверьте профиль и дождитесь повторной проверки."}
            />
          )}
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
