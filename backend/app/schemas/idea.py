from pydantic import BaseModel, computed_field, Field
from typing import Optional, List
from datetime import datetime, timedelta
from uuid import UUID

class IdeaCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    short_description: str = Field(min_length=1, max_length=10000)
    roles_needed: Optional[str] = Field(default=None, max_length=2000)
    roles_specialists: Optional[str] = Field(default=None, max_length=2000)
    roles_companies: Optional[str] = Field(default=None, max_length=2000)
    tags: Optional[str] = Field(default=None, max_length=2000)

class IdeaUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    short_description: Optional[str] = Field(default=None, min_length=1, max_length=10000)
    roles_needed: Optional[str] = Field(default=None, max_length=2000)
    roles_specialists: Optional[str] = Field(default=None, max_length=2000)
    roles_companies: Optional[str] = Field(default=None, max_length=2000)
    tags: Optional[str] = Field(default=None, max_length=2000)

class IdeaResponse(BaseModel):
    id: UUID
    display_id: int
    title: str
    short_description: str
    author_id: int
    author_email: Optional[str] = None
    roles_needed: Optional[str]
    roles_specialists: Optional[str] = None
    roles_companies: Optional[str] = None
    tags: Optional[str]
    status: str
    created_at: datetime
    # Только количество откликов, без деталей (кто откликнулся и т.д.) —
    # доступно всем, в отличие от полного списка в /responses.
    responses_count: int = 0
    team_count: int = 0

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True

class IdeaResponseCreate(BaseModel):
    role: str = Field(min_length=1, max_length=100)
    message: Optional[str] = Field(default=None, max_length=2000)

class IdeaResponseOut(BaseModel):
    id: int
    idea_id: UUID
    user_id: int
    user_nickname: Optional[str] = None
    role: str
    message: Optional[str]
    status: str
    created_at: datetime

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    idea_id: Optional[UUID] = None

class ProjectOut(BaseModel):
    id: UUID
    display_id: int
    name: str
    description: Optional[str] = None
    roles_needed: Optional[str] = None
    roles_specialists: Optional[str] = None
    roles_companies: Optional[str] = None
    tags: Optional[str] = None
    idea_id: Optional[UUID] = None
    created_by: int
    creator_email: Optional[str] = None
    created_at: datetime

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True

class ProjectMemberOut(BaseModel):
    id: int
    project_id: UUID
    user_id: int
    username: Optional[str] = None
    user_role: Optional[str] = None
    role: Optional[str]
    joined_at: datetime

    @computed_field
    @property
    def joined_at_msk(self) -> str:
        msk = self.joined_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True

class ProjectInviteCreate(BaseModel):
    project_id: UUID
    user_id: int
    role: Optional[str] = None

class ProjectInviteOut(BaseModel):
    id: int
    project_id: UUID
    user_id: int
    role: Optional[str]
    status: str
    created_at: datetime
    project_name: Optional[str] = None
    inviter_username: Optional[str] = None

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True