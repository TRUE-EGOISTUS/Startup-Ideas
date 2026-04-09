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

class TaskResponse(BaseModel):
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