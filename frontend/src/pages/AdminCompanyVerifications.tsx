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
import { useAuthStore } from "../store/auth";

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

type Moderator = {
  id: number;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
};

type ModeratorInvitation = {
  id: number;
  email: string;
  expires_at: string;
  expired: boolean;
};

type ModeratorCandidate = {
  id: number;
  email: string;
  username: string;
};

const statusLabels = {
  pending: "Ожидают проверки",
  verified: "Подтвержденные",
  rejected: "Отклоненные"
};

export function AdminCompanyVerificationsPage() {
  const { user } = useAuthStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountRole, setAccountRole] = useState<"all" | "specialist" | "company">("all");
  const [activeTab, setActiveTab] = useState("companies");
  const [status, setStatus] = useState<Company["verification_status"]>("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [moderatorsLoading, setModeratorsLoading] = useState(false);
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [invitations, setInvitations] = useState<ModeratorInvitation[]>([]);
  const [candidates, setCandidates] = useState<ModeratorCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<number>();
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Company | null>(null);
  const [reason, setReason] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

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
        params: {
          search: search || undefined,
          role: accountRole === "all" ? undefined : accountRole
        }
      });
      setAccounts(data);
    } catch {
      message.error("Не удалось загрузить аккаунты");
    } finally {
      setAccountsLoading(false);
    }
  }, [accountRole, search]);

  const loadModerators = useCallback(async () => {
    setModeratorsLoading(true);
    try {
      const { data } = await api.get<{ moderators: Moderator[]; invitations: ModeratorInvitation[] }>(
        "/users/admin/moderators"
      );
      setModerators(data.moderators);
      setInvitations(data.invitations);
      if (user?.is_superuser) {
        const candidatesResponse = await api.get<ModeratorCandidate[]>("/users/admin/moderator-candidates");
        setCandidates(candidatesResponse.data);
      }
    } catch {
      message.error("Не удалось загрузить модераторов");
    } finally {
      setModeratorsLoading(false);
    }
  }, [user?.is_superuser]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (activeTab === "accounts") {
      loadAccounts();
    }
  }, [activeTab, loadAccounts]);

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

  const inviteModerator = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await api.post("/users/admin/moderator-invitations", null, {
        params: { email: inviteEmail.trim() }
      });
      setInviteEmail("");
      await loadModerators();
      message.success("Приглашение отправлено");
    } catch {
      message.error("Не удалось отправить приглашение");
    }
  };

  const grantModerator = async () => {
    if (!selectedCandidate) return;
    try {
      await api.post(`/users/admin/moderators/${selectedCandidate}/grant`);
      setSelectedCandidate(undefined);
      await loadModerators();
      message.success("Права модератора выданы");
    } catch {
      message.error("Не удалось назначить модератора");
    }
  };

  const resendInvitation = async (id: number) => {
    try {
      await api.post(`/users/admin/moderator-invitations/${id}/resend`);
      await loadModerators();
      message.success("Приглашение отправлено повторно");
    } catch {
      message.error("Не удалось повторно отправить приглашение");
    }
  };

  const revokeInvitation = async (id: number) => {
    try {
      await api.delete(`/users/admin/moderator-invitations/${id}`);
      await loadModerators();
      message.success("Приглашение отозвано");
    } catch {
      message.error("Не удалось отозвать приглашение");
    }
  };

  const revokeModerator = async (id: number) => {
    try {
      await api.post(`/users/admin/moderators/${id}/revoke`);
      await loadModerators();
      message.success("Права модератора отозваны");
    } catch {
      message.error("Не удалось отозвать права модератора");
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
      <Space wrap className="mb-4">
        <Select
          value={accountRole}
          onChange={setAccountRole}
          options={[
            { value: "all", label: "Все аккаунты" },
            { value: "specialist", label: "Специалисты" },
            { value: "company", label: "Компании" }
          ]}
        />
        <Input.Search
          placeholder="Поиск по email или username"
          allowClear
          onSearch={setSearch}
          style={{ width: 280 }}
        />
        <Button onClick={loadAccounts} loading={accountsLoading}>
          Обновить список
        </Button>
      </Space>
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

  const moderatorsTab = (
    <Card>
      {user?.is_superuser && (
        <Card title="Добавить модератора" className="admin-moderator-card mb-4">
          <Tabs
            items={[
              {
                key: "existing",
                label: "Выбрать специалиста",
                children: (
                  <Space.Compact className="admin-moderator-controls">
                    <Select
                      showSearch
                      allowClear
                      value={selectedCandidate}
                      placeholder="Выберите подтвержденного специалиста"
                      optionFilterProp="label"
                      options={candidates.map((candidate) => ({
                        value: candidate.id,
                        label: `${candidate.username} — ${candidate.email}`
                      }))}
                      onChange={setSelectedCandidate}
                      style={{ width: 360 }}
                    />
                    <Button type="primary" disabled={!selectedCandidate} onClick={grantModerator}>
                      Назначить
                    </Button>
                  </Space.Compact>
                )
              },
              {
                key: "invite",
                label: "Пригласить нового сотрудника",
                children: (
                  <Space.Compact className="admin-moderator-controls">
                    <Input
                      type="email"
                      placeholder="employee@example.com"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      style={{ width: 280 }}
                    />
                    <Button type="primary" disabled={!inviteEmail.trim()} onClick={inviteModerator}>
                      Отправить приглашение
                    </Button>
                  </Space.Compact>
                )
              }
            ]}
          />
        </Card>
      )}
      {moderatorsLoading && <Spin />}
      {!moderatorsLoading && (
        <>
          <Typography.Title level={4}>Действующие модераторы</Typography.Title>
          {moderators.length === 0 ? (
            <Empty description="Модераторов пока нет" />
          ) : (
            <List
              dataSource={moderators}
              renderItem={(moderator) => (
                <List.Item
                  actions={[
                    user?.is_superuser && (
                      <Button key="revoke" danger onClick={() => revokeModerator(moderator.id)}>
                        Отозвать права
                      </Button>
                    )
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    title={moderator.username}
                    description={`${moderator.email} · ${moderator.is_active ? "активен" : "заблокирован"}`}
                  />
                </List.Item>
              )}
            />
          )}
          <Typography.Title level={4}>Ожидающие приглашения</Typography.Title>
          {invitations.length === 0 ? (
            <Empty description="Активных приглашений нет" />
          ) : (
            <List
              dataSource={invitations}
              renderItem={(invitation) => (
                <List.Item
                  actions={[
                    <Button key="resend" onClick={() => resendInvitation(invitation.id)}>
                      Отправить повторно
                    </Button>,
                    <Button key="revoke" danger onClick={() => revokeInvitation(invitation.id)}>
                      Отозвать
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={invitation.email}
                    description={`Действует до ${new Date(invitation.expires_at).toLocaleString("ru-RU")}`}
                  />
                </List.Item>
              )}
            />
          )}
        </>
      )}
    </Card>
  );

  return (
    <>
      <Space align="center" className="mb-4">
        <Typography.Title level={2} style={{ color: "#fff", margin: 0 }}>
          Панель администратора
        </Typography.Title>
      </Space>
      <Tabs
        items={[
          { key: "companies", label: "Компании", children: companiesTab },
          { key: "accounts", label: "Аккаунты", children: accountsTab },
          { key: "moderators", label: "Модераторы", children: moderatorsTab }
        ]}
        onChange={(key) => {
          setActiveTab(key);
          if (key === "moderators") loadModerators();
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
