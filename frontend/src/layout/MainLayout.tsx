import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Layout, Menu, Button, Typography, Space, Drawer } from "antd";
import {
  HomeOutlined,
  CheckCircleOutlined,
  BulbOutlined,
  TeamOutlined,
  UserOutlined,
  LoginOutlined,
  MenuOutlined
} from "@ant-design/icons";
import { useAuthStore } from "../store/auth";

const { Header, Content } = Layout;

export function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loadMe, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const selectedKey = location.pathname.split("/")[1] || "home";
  const menuItems = useMemo(
    () => [
      { key: "home", icon: <HomeOutlined />, label: <Link to="/">Главная</Link> },
      { key: "tasks", icon: <CheckCircleOutlined />, label: <Link to="/tasks">Задачи</Link> },
      { key: "ideas", icon: <BulbOutlined />, label: <Link to="/ideas">Идеи</Link> },
      { key: "projects", icon: <TeamOutlined />, label: <Link to="/projects">Проекты</Link> },
      { key: "profile", icon: <UserOutlined />, label: <Link to="/profile">Профиль</Link> }
    ],
    []
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
          <Typography.Title level={4} className="!mb-0 app-title">
            Startup Ideas
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
              <Typography.Text>{user.email}</Typography.Text>
              <Button onClick={handleLogout} danger>
                Выйти
              </Button>
            </>
          ) : (
            <Button icon={<LoginOutlined />} type="primary">
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
              <Typography.Text>{user.email}</Typography.Text>
              <Button onClick={handleLogout} danger className="w-full">
                Выйти
              </Button>
            </>
          ) : (
            <Button icon={<LoginOutlined />} type="primary" className="w-full">
              <Link to="/login">Войти</Link>
            </Button>
          )}
        </div>
      </Drawer>
      <Content className="app-content">
        <div className="app-container">
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
