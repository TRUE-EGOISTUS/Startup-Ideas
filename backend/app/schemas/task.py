from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, computed_field
from typing import Optional
from datetime import datetime, timedelta

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    reward: Optional[int] = None
    deadline: Optional[datetime] = None   # клиент присылает московское время (наивное)
    visibility: str = "public"
    execution_mode: str = "classic"
    required_skills: Optional[str] = None
    difficulty: Optional[str] = None
    executor_deadline_minutes: Optional[int] = Field(None, gt=0, description="Срок выполнения для исполнителя в минутах (только для classic задач)")

class TaskResponseSchema(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    author_id: int
    created_at: datetime   # UTC из БД
    reward: Optional[int]
    deadline: Optional[datetime]   # UTC из БД
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
        return msk.isoformat(timespec='milliseconds')

    @computed_field
    @property
    def deadline_msk(self) -> Optional[str]:
        if self.deadline:
            msk = self.deadline + timedelta(hours=3)
            return msk.isoformat(timespec='milliseconds')
        return None

    class Config:
        from_attributes = True

class TaskFilter(BaseModel):
    status: Optional[str] = None
    difficulty: Optional[str] = None
    min_reward: Optional[int] = None
    max_reward: Optional[int] = None
    search: Optional[str] = None
    skip: int = 0
    limit: int = 100

class TaskResponseCreate(BaseModel):
    message: str

class TaskResponseOut(BaseModel):
    id: int
    task_id: int
    user_id: int
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

class TaskCompleteRequest(BaseModel):
    solution_url: Optional[str] = None
    comment: Optional[str] = None

class TaskReviewRequest(BaseModel):
    rating: int # 1-5
    feedback: Optional[str] = None

class TaskExecutionOut(BaseModel):
    id: int
    task_id: int
    user_id: int
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
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True

class OpenSolutionRequest(BaseModel):
    solution_url: Optional[str]= None
    comment: Optional[str] = None
     