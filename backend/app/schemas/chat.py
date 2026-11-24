from uuid import UUID
from datetime import datetime, timedelta
from typing import Optional, List

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator


class MessageCreate(BaseModel):
    text: str = Field(default="", max_length=10_000)
    attachment_url: Optional[str] = Field(default=None, max_length=2_048)
    attachment_name: Optional[str] = Field(default=None, max_length=255)
    reply_to_id: Optional[int] = Field(default=None, gt=0)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("attachment_name")
    @classmethod
    def strip_attachment_name(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value else value

    @model_validator(mode="after")
    def require_message_or_attachment(self):
        if not self.text and not self.attachment_url:
            raise ValueError("Сообщение должно содержать текст или вложение")
        return self


class ReactionCreate(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)

    @field_validator("emoji")
    @classmethod
    def strip_emoji(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Реакция не может быть пустой")
        return value


class ReactionSummary(BaseModel):
    emoji: str
    count: int = Field(ge=0)
    user_ids: List[int] = Field(default_factory=list)

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    task_id: UUID
    user_id: int
    text: str
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    reply_to_id: Optional[int] = None
    system_type: Optional[str] = None
    read_at: Optional[datetime] = None
    created_at: datetime  # UTC
    sender_name: Optional[str] = None
    sender_avatar_url: Optional[str] = None
    reactions: List[ReactionSummary] = Field(default_factory=list)

    @computed_field
    @property
    def created_at_msk(self) -> str:
        # В проекте created_at хранится в UTC; MSK = UTC+3.
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec="milliseconds")

    class Config:
        from_attributes = True


class ProjectMessageCreate(BaseModel):
    text: str = Field(default="", max_length=10_000)
    reply_to_id: Optional[int] = Field(default=None, gt=0)
    channel: str = Field(default="general", min_length=1, max_length=64)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("channel")
    @classmethod
    def normalize_channel(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Канал не может быть пустым")
        return value


class ProjectMessageOut(BaseModel):
    id: int
    project_id: UUID
    user_id: int
    text: str
    channel: str = "general"
    is_announcement: bool = False
    is_pinned: bool = False
    reply_to_id: Optional[int] = None
    system_type: Optional[str] = None
    read_at: Optional[datetime] = None
    created_at: datetime
    sender_name: Optional[str] = None
    sender_avatar_url: Optional[str] = None
    reactions: List[ReactionSummary] = Field(default_factory=list)

    @computed_field
    @property
    def created_at_msk(self) -> str:
        # В проекте created_at хранится в UTC; MSK = UTC+3.
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec="milliseconds")

    class Config:
        from_attributes = True
