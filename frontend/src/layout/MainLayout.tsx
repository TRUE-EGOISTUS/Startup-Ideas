import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Layout, Menu, Button, Typography, Space } from "antd";
import {
  HomeOutlined,
  CheckCircleOutlined,
  BulbOutlined,
  TeamOutlined,
  UserOutlined,
  LoginOutlined
} from "@ant-design/icons";
import { useAuthStore } from "../store/auth";

const { Header, Content } = Layout;

export function MainLayout() {
  const location = useLocation();
  const { user, loadMe, logout } = useAuthStore();

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const selectedKey = location.pathname.split("/")[1] || "home";

  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm flex items-center justify-between">
        <Space>
          <Typography.Title level={4} className="!mb-0">
            Startup Ideas
          </Typography.Title>
        </Space>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={[
            { key: "home", icon: <HomeOutlined />, label: <Link to="/">Главная</Link> },
            { key: "tasks", icon: <CheckCircleOutlined />, label: <Link to="/tasks">Задачи</Link> },
            { key: "ideas", icon: <BulbOutlined />, label: <Link to="/ideas">Идеи</Link> },
            { key: "projects", icon: <TeamOutlined />, label: <Link to="/projects">Проекты</Link> },
            { key: "profile", icon: <UserOutlined />, label: <Link to="/profile">Профиль</Link> }
          ]}
        />
        <Space>
          {user ? (
            <>
              <Typography.Text>{user.email}</Typography.Text>
              <Button onClick={() => logout()} danger>
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
      <Content className="p-6">
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
