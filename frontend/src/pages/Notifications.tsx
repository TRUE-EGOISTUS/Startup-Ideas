import { useEffect, useState } from "react";
import { Button, Card, Empty, List, Popconfirm, Segmented, Space, Tag, Typography, message } from "antd";
import { CheckOutlined, DeleteOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type Notification = {
  id: number;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const loadNotifications = async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const selectedRequest = api.get<Notification[]>("/notifications", {
        params: {
          skip: append ? notifications.length : 0,
          limit: 50,
          unread_only: filter === "unread"
        }
      });
      const totalsRequest = append
        ? null
        : Promise.all([
            api.get<{ total: number; unread: number }>("/notifications/counts")
          ]);
      const { data, headers } = await selectedRequest;
      setNotifications((items) => append ? [...items, ...data] : data);
      setTotal(Number(headers["x-total-count"] || data.length));
      if (totalsRequest) {
        const [{ data: counts }] = await totalsRequest;
        setTotalAll(counts.total);
        setTotalUnread(counts.unread);
      }
    } catch {
      message.error("Не удалось загрузить уведомления");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setNotifications([]);
    void loadNotifications();
  }, [filter]);

  const markAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      if (filter === "unread") {
        setNotifications([]);
        setTotal(0);
        setTotalUnread(0);
      } else {
        setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
        setTotalUnread(0);
      }
      message.success("Все уведомления отмечены прочитанными");
    } catch {
      message.error("Не удалось отметить уведомления прочитанными");
    }
  };

  const clearNotifications = async () => {
    try {
      await api.delete("/notifications");
      setNotifications([]);
      setTotal(0);
      message.success("Уведомления очищены");
    } catch {
      message.error("Не удалось очистить уведомления");
    }
  };

  const openNotification = async (item: Notification) => {
    try {
      if (!item.is_read) {
        await api.patch(`/notifications/${item.id}/read`);
        setNotifications((items) => items.map((notification) =>
          notification.id === item.id ? { ...notification, is_read: true } : notification
        ));
        setTotalUnread((count) => Math.max(0, count - 1));
      }
      if (item.link) navigate(item.link);
    } catch {
      message.error("Не удалось открыть уведомление");
    }
  };

  const visibleNotifications = filter === "unread"
    ? notifications.filter((item) => !item.is_read)
    : notifications;

  return (
    <div className="space-y-6">
      <div className="page-toolbar">
        <Typography.Title level={2} className="page-title">Уведомления</Typography.Title>
        <Space>
          <Button
            type="primary"
            className="notifications-action-button"
            icon={<CheckOutlined />}
            onClick={markAllRead}
          >
            Прочитать все
          </Button>
          <Popconfirm
            title="Очистить все уведомления?"
            description="Это действие нельзя отменить."
            onConfirm={clearNotifications}
            okText="Очистить"
            cancelText="Отмена"
          >
            <Button
              type="primary"
              danger
              className="notifications-action-button notifications-clear-button"
              icon={<DeleteOutlined />}
              disabled={!notifications.length}
            >
              Очистить список
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Card>
        <div className="notifications-filter">
          <Segmented
            value={filter}
            onChange={(value) => setFilter(value as "all" | "unread")}
            options={[
              { label: `Все (${totalAll})`, value: "all" },
              { label: `Непрочитанные (${totalUnread})`, value: "unread" }
            ]}
          />
        </div>
        <List
          loading={loading}
          dataSource={visibleNotifications}
          locale={{ emptyText: <Empty description={filter === "unread" ? "Непрочитанных уведомлений нет" : "Уведомлений пока нет"} /> }}
          renderItem={(item) => (
            <List.Item
              className={item.is_read ? "notification-list-item" : "notification-list-item notification-list-item--unread"}
              actions={[
                item.link ? (
                  <Button onClick={() => openNotification(item)}>Открыть</Button>
                ) : null
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <span>{item.title}</span>
                    {!item.is_read && <Tag color="blue">Новое</Tag>}
                  </Space>
                }
                description={
                  <>
                    <div>{item.message}</div>
                    <Typography.Text type="secondary">
                      {new Date(item.created_at).toLocaleString("ru-RU")}
                    </Typography.Text>
                  </>
                }
              />
            </List.Item>
          )}
        />
        {notifications.length < total && (
          <div className="notifications-load-more">
            <Button loading={loadingMore} onClick={() => void loadNotifications(true)}>
              Загрузить ещё
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
