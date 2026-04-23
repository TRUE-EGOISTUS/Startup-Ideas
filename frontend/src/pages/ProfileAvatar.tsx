import { Button, Card, Typography, Upload, message } from "antd";
import type { UploadProps } from "antd";
import { api } from "../lib/api";

export function ProfileAvatarPage() {
  const uploadProps: UploadProps = {
    beforeUpload: async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      try {
        await api.post("/users/me/avatar", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        message.success("Файл загружен");
      } catch {
        message.error("Не удалось загрузить файл");
      }
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <Typography.Title level={2}>Аватар / логотип</Typography.Title>
      <Card>
        <Upload {...uploadProps}>
          <Button>Загрузить файл</Button>
        </Upload>
      </Card>
    </div>
  );
}
