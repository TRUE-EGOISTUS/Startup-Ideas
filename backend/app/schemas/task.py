from datetime import datetime, timedelta
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, computed_field


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=10000)
    reward: Optional[int] = Field(default=None, ge=0)
    deadline: Optional[datetime] = None  # клиент присылает московское время (наивное)
    visibility: Literal["public", "private"] = "public"
    execution_mode: Literal["classic", "open"] = "classic"
    required_skills: Optional[str] = Field(default=None, max_length=2000)
    difficulty: Optional[str] = Field(default=None, max_length=20)
    executor_deadline_minutes: Optional[int] = Field(
        default=None,
        gt=0,
        description="Срок выполнения для исполнителя в минутах (только для classic задач)",
    )


class TaskResponseSchema(BaseModel):
    id: UUID
    display_id: int
    title: str
    description: Optional[str]
    status: str
    author_id: int
    author_email: Optional[str] = None
    assigned_to_id: Optional[int] = None
    created_at: datetime
    reward: Optional[int]
    deadline: Optional[datetime]
    visibility: str
    execution_mode: str
    required_skills: Optional[str]
    difficulty: Optional[str]
    executor_deadline_minutes: Optional[int] = None
    current_executor_deadline: Optional[datetime] = None

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec="milliseconds")

    @computed_field
    @property
    def deadline_msk(self) -> Optional[str]:
        if self.deadline:
            msk = self.deadline + timedelta(hours=3)
            return msk.isoformat(timespec="milliseconds")
        return None

    class Config:
        from_attributes = True


class TaskFilter(BaseModel):
    status: Optional[str] = None
    difficulty: Optional[str] = None
    min_reward: Optional[int] = Field(default=None, ge=0)
    max_reward: Optional[int] = Field(default=None, ge=0)
    search: Optional[str] = Field(default=None, max_length=100)
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=100)


class TaskResponseCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class TaskResponseOut(BaseModel):
    id: int
    task_id: UUID
    user_id: int
    user_nickname: Optional[str] = None
    message: Optional[str]
    status: str
    created_at: datetime

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec="milliseconds")

    class Config:
        from_attributes = True


class TaskCompleteRequest(BaseModel):
    solution_url: Optional[str] = Field(default=None, max_length=500)
    comment: Optional[str] = Field(default=None, max_length=2000)


class TaskReviewRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    feedback: Optional[str] = Field(default=None, max_length=2000)


class TaskExecutionOut(BaseModel):
    id: int
    task_id: UUID
    user_id: int
    user_nickname: Optional[str] = None
    solution_url: Optional[str]
    comment: Optional[str]
    feedback: Optional[str]
    rating: Optional[int]
    status: str
    created_at: datetime

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec="milliseconds")

    class Config:
        from_attributes = True


class TaskDetailOut(TaskResponseSchema):
    responses: Optional[list[TaskResponseOut]] = None
    executions: Optional[list[TaskExecutionOut]] = None

    class Config:
        from_attributes = True


class OpenSolutionRequest(BaseModel):
    solution_url: Optional[str] = Field(default=None, max_length=500)
    comment: Optional[str] = Field(default=None, max_length=2000)
