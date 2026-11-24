from uuid import UUID
from pydantic import BaseModel, computed_field, Field
from datetime import datetime, timedelta
from typing import Optional, List

class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    client_id: Optional[str] = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    reply_to_id: Optional[int] = Field(default=None, gt=0)

class ReactionCreate(BaseModel):
    emoji: str

class ReactionSummary(BaseModel):
    emoji: str
    count: int
    user_ids: List[int]

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
    created_at: datetime   # UTC
    sender_name: Optional[str] = None
    sender_avatar_url: Optional[str] = None
    reactions: List[ReactionSummary] = []

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True

class ProjectMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    client_id: Optional[str] = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    reply_to_id: Optional[int] = Field(default=None, gt=0)
    channel: str = Field(default="general", min_length=1, max_length=40)

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
    reactions: List[ReactionSummary] = []

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True