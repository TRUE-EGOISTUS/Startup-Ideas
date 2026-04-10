from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    reward: Optional[int] = None
    deadline: Optional[datetime] = None
    visibility: str = "public"
    execution_mode: str = "classic"
    required_skills: Optional[str] = None
    difficulty: Optional[str] = None

class TaskResponseSchema(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    author_id: int
    created_at: datetime
    reward: Optional[int]
    deadline: Optional[datetime]
    visibility: str
    execution_mode: str
    required_skills: Optional[str]
    difficulty: Optional[str]

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

    class Config:
        from_attributes = True

class TaskCompleteRequest(BaseModel):
    solution_url: Optional[str] = None
    comment: Optional[str] = None

class TaskReviewRequest(BaseModel):
    rating: int # 1-5
    feedback: Optional[str] = None

class TaskExecutionOut:
    id: int
    task_id: int
    user_id: int
    solution_url: Optional[str]
    comment: Optional[str]
    feedback: Optional[str]
    rating: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True