import React, { useLayoutEffect } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import "antd/dist/reset.css";
import "./index.css";
import { router } from "./router";
import { useThemeStore } from "./store/theme";

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const dark = useThemeStore((s) => s.dark);

  useLayoutEffect(() => {
    const cls = "dark-theme";
    document.documentElement.classList.toggle(cls, dark);
    document.body.classList.toggle(cls, dark);
  }, [dark]);

  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#4F46E5",
          borderRadius: 12,
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeWrapper>
      <RouterProvider router={router} />
    </ThemeWrapper>
  </React.StrictMode>
);
