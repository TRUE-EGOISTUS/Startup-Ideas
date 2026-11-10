import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type Company = {
  id: number;
  email: string;
  username?: string | null;
  is_active: boolean;
  verification_status: "verified" | "pending" | "rejected";
  verification_rejection_reason?: string | null;
  company_profile?: {
    company_name: string | null;
    description: string | null;
    contact_info: string | null;
  } | null;
};

type Account = {
  id: number;
  email: string;
  username?: string | null;
  role: "specialist" | "company";
  is_active: boolean;
  is_superuser: boolean;
  verification_status: "verified" | "pending" | "rejected";
};

const statusLabels = {
  pending: "Ожидают проверки",
  verified: "Подтвержденные",
  rejected: "Отклоненные"
};

export function AdminCompanyVerificationsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<Company["verification_status"]>("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Company | null>(null);
  const [reason, setReason] = useState("");

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Company[]>("/users/admin/company-verifications", {
        params: { status, search: search || undefined }
      });
      setCompanies(data);
    } catch {
      setError("Не удалось загрузить компании");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const { data } = await api.get<Account[]>("/users/admin/accounts", {
        params: { search: search || undefined }
      });
      setAccounts(data);
    } catch {
      message.error("Не удалось загрузить аккаунты");
    } finally {
      setAccountsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const updateVerification = async (userId: number, action: "approve" | "resubmit") => {
    setProcessingId(userId);
    try {
      await api.post(`/users/admin/company-verifications/${userId}/${action}`);
      await loadCompanies();
      message.success(action === "approve" ? "Компания подтверждена" : "Заявка возвращена на проверку");
    } catch {
      message.error("Не удалось изменить статус компании");
    } finally {
      setProcessingId(null);
    }
  };

  const rejectCompany = async () => {
    if (!rejecting || reason.trim().length < 3) return;
    setProcessingId(rejecting.id);
    try {
      await api.post(`/users/admin/company-verifications/${rejecting.id}/reject`, null, {
        params: { reason: reason.trim() }
      });
      setRejecting(null);
      setReason("");
      await loadCompanies();
      message.success("Компания отклонена");
    } catch {
      message.error("Не удалось отклонить компанию");
    } finally {
      setProcessingId(null);
    }
  };

  const toggleAccount = async (account: Account) => {
    const action = account.is_active ? "block" : "unblock";
    setProcessingId(account.id);
    try {
      await api.post(`/users/admin/accounts/${account.id}/${action}`);
      await loadAccounts();
      message.success(account.is_active ? "Аккаунт заблокирован" : "Аккаунт разблокирован");
    } catch {
      message.error("Не удалось изменить состояние аккаунта");
    } finally {
      setProcessingId(null);
    }
  };

  const companiesTab = (
    <Card>
      <Space wrap className="mb-4">
        <Input.Search
          placeholder="Поиск по email или username"
          allowClear
          onSearch={setSearch}
          style={{ width: 280 }}
        />
        <Select
          value={status}
          onChange={setStatus}
          options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
        />
      </Space>
      {loading && <Spin />}
      {error && <Alert type="error" message={error} showIcon />}
      {!loading && !error && companies.length === 0 && <Empty description="Компании не найдены" />}
      {!loading && !error && companies.length > 0 && (
        <List
          dataSource={companies}
          renderItem={(company) => (
            <List.Item
              actions={[
                status === "pending" && (
                  <Button
                    key="approve"
                    type="primary"
                    loading={processingId === company.id}
                    onClick={() => updateVerification(company.id, "approve")}
                  >
                    Подтвердить
                  </Button>
                ),
                status === "pending" && (
                  <Button key="reject" danger onClick={() => setRejecting(company)}>
                    Отклонить
                  </Button>
                ),
                status === "rejected" && (
                  <Button
                    key="resubmit"
                    loading={processingId === company.id}
                    onClick={() => updateVerification(company.id, "resubmit")}
                  >
                    Вернуть на проверку
                  </Button>
                )
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Typography.Text strong>
                      {company.company_profile?.company_name || company.username || "Без названия"}
                    </Typography.Text>
                    <Tag color={status === "verified" ? "green" : status === "rejected" ? "red" : "orange"}>
                      {statusLabels[status]}
                    </Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical">
                    <Typography.Text>{company.email}</Typography.Text>
                    {company.company_profile?.description && (
                      <Typography.Text>{company.company_profile.description}</Typography.Text>
                    )}
                    {company.company_profile?.contact_info && (
                      <Typography.Text type="secondary">
                        Контакты: {company.company_profile.contact_info}
                      </Typography.Text>
                    )}
                    {company.verification_rejection_reason && (
                      <Typography.Text type="danger">
                        Причина: {company.verification_rejection_reason}
                      </Typography.Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );

  const accountsTab = (
    <Card>
      <Button onClick={loadAccounts} loading={accountsLoading} className="mb-4">
        Обновить список
      </Button>
      {accountsLoading && <Spin />}
      {!accountsLoading && accounts.length === 0 && <Empty description="Аккаунты не найдены" />}
      {!accountsLoading && accounts.length > 0 && (
        <List
          dataSource={accounts}
          renderItem={(account) => (
            <List.Item
              actions={[
                !account.is_superuser && (
                  <Button
                    key="toggle"
                    danger={account.is_active}
                    loading={processingId === account.id}
                    onClick={() => toggleAccount(account)}
                  >
                    {account.is_active ? "Заблокировать" : "Разблокировать"}
                  </Button>
                )
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Typography.Text>{account.username || account.email}</Typography.Text>
                    <Tag>{account.role === "company" ? "Компания" : "Специалист"}</Tag>
                    <Tag color={account.is_active ? "green" : "red"}>
                      {account.is_active ? "Активен" : "Заблокирован"}
                    </Tag>
                  </Space>
                }
                description={account.email}
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );

  return (
    <>
      <Typography.Title level={2} style={{ color: "#fff" }}>
        Панель администратора
      </Typography.Title>
      <Tabs
        items={[
          { key: "companies", label: "Компании", children: companiesTab },
          { key: "accounts", label: "Аккаунты", children: accountsTab }
        ]}
        onChange={(key) => {
          if (key === "accounts" && accounts.length === 0) loadAccounts();
        }}
      />
      <Modal
        title="Причина отклонения"
        open={Boolean(rejecting)}
        okText="Отклонить"
        cancelText="Отмена"
        okButtonProps={{ danger: true, disabled: reason.trim().length < 3, loading: processingId === rejecting?.id }}
        onOk={rejectCompany}
        onCancel={() => {
          setRejecting(null);
          setReason("");
        }}
      >
        <Input.TextArea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Например: заполните описание компании и контактные данные"
          rows={4}
        />
      </Modal>
    </>
  );
}
