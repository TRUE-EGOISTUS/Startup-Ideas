from pydantic import BaseModel, computed_field
from typing import Optional, List
from datetime import datetime, timedelta

class IdeaCreate(BaseModel):
    title: str
    short_description: str
    full_description: Optional[str] = None
    roles_needed: Optional[str] = None   # JSON строка
    tags: Optional[str] = None

class IdeaUpdate(BaseModel):
    title: Optional[str] = None
    short_description: Optional[str] = None
    full_description: Optional[str] = None
    roles_needed: Optional[str] = None
    tags: Optional[str] = None
    status: Optional[str] = None

class IdeaResponse(BaseModel):
    id: int
    title: str
    short_description: str
    full_description: Optional[str]
    author_id: int
    roles_needed: Optional[str]
    tags: Optional[str]
    status: str
    created_at: datetime

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True

class IdeaResponseCreate(BaseModel):
    role: str  # роль, на которую претендует откликнувшийся
    message: Optional[str] = None

class IdeaResponseOut(BaseModel):
    id: int
    idea_id: int
    user_id: int
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
    idea_id: Optional[int] = None

class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    idea_id: Optional[int]
    created_by: int
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
    project_id: int
    user_id: int
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
    project_id: int
    user_id: int
    role: Optional[str] = None

class ProjectInviteOut(BaseModel):
    id: int
    project_id: int
    user_id: int
    role: Optional[str]
    status: str
    created_at: datetime

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True