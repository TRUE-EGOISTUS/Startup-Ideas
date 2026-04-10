from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import or_
from app.database import SessionLocal, get_db
from app.models import User, Task, UserRole
from app.auth import get_current_user
from app.schemas.task import TaskCreate, TaskResponse

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("/", response_model=TaskResponse)
def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.COMPANY:
        raise HTTPException(status_code=403, detail="Only companies can create tasks")
    task = Task(
        title=task_data.title,
        description=task_data.description,
        author_id=current_user.id,
        reward = task_data.reward,
        deadline = task_data.deadline,
        visibility = task_data.visibility,
        execution_mode = task_data.execution_mode,
        required_skills=task_data.required_skills,
        difficulty=task_data.difficulty
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@router.get("/")
def get_tasks(
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    difficulty: Optional[str] = None,
    min_reward: Optional[int] = None,
    max_reward: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
):
    query = db.query(Task)

    if status:
        query = query.filter(Task.status == status)
    if difficulty:
        query = query.filter(Task.difficulty == difficulty)
    if min_reward is not None:
        query = query.filter(Task.reward >= min_reward)
    if max_reward:
        query = query.filter(Task.reward <= max_reward)
    if search:
        query = query.filter(
            or_(
                Task.title.ilike(f"%{search}%"),
                Task.description.ilike(f"%{search}%")
            )
        )
    
    tasks = query.offset(skip).limit(limit).all()
    return tasks