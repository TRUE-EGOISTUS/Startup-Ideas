import { Result } from "antd";

export function NotFoundPage() {
  return <Result className="not-found-page" status="404" title="404" subTitle="Страница не найдена" />;
}
