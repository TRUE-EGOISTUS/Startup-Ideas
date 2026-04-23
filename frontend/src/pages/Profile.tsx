import { Button, Card, Space, Typography } from "antd";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function ProfilePage() {
  const { user } = useAuthStore();
  return (
    <div className="space-y-6">
      <Typography.Title level={2}>Профиль</Typography.Title>
      <Card>
        <Space wrap>
          <Button type="primary">
            <Link to="/profile/account">Аккаунт</Link>
          </Button>
          {user?.role === "company" && (
            <Button>
              <Link to="/profile/details">Профильные данные</Link>
            </Button>
          )}
          <Button>
            <Link to="/profile/avatar">Аватар / логотип</Link>
          </Button>
        </Space>
      </Card>
    </div>
  );
}
