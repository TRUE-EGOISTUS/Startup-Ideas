import { Alert, Card, Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setState("error");
      return;
    }

    api.get("/auth/verify-email", { params: { token } })
      .then(() => setState("success"))
      .catch(() => setState("error"));
  }, [searchParams]);

  return (
    <div className="auth-page">
      <Card className="auth-card" title="Подтверждение почты">
        {state === "loading" && <Spin />}
        {state === "success" && (
          <Alert
            type="success"
            message="Почта подтверждена"
            description={<Link to="/login">Перейти ко входу</Link>}
          />
        )}
        {state === "error" && (
          <Alert
            type="error"
            message="Не удалось подтвердить почту"
            description={<Typography.Text>Ссылка недействительна или устарела.</Typography.Text>}
          />
        )}
      </Card>
    </div>
  );
}
