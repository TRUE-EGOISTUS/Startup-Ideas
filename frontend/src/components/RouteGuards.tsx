import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuthStore } from "../store/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="app-page-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function RequireRole({ role, children }: { role: "company" | "specialist"; children: ReactNode }) {
  const location = useLocation();
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="app-page-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
