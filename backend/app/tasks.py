from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from sqlalchemy import or_
from app.database import get_db
from app.models import User, Task, UserRole, TaskResponseModel
from app.auth import get_current_user
from app.schemas.task import TaskCreate, TaskResponseSchema, TaskResponseCreate, TaskResponseOut

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("/", response_model=TaskResponseSchema)
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
        reward=task_data.reward,
        deadline=task_data.deadline,
        visibility=task_data.visibility,
        execution_mode=task_data.execution_mode,
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

@router.post("/{task_id}/responses", response_model=TaskResponseOut)
def create_response(
    task_id: int,
    response_data: TaskResponseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.SPECIALIST:
        raise HTTPException(status_code=403, detail="Only specialists can respond")
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "open":
        raise HTTPException(status_code=400, detail="Task is not open for responses")
    
    existing = db.query(TaskResponseModel).filter(
        TaskResponseModel.task_id == task_id,
        TaskResponseModel.user_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already responded")
    
    response = TaskResponseModel(
        task_id=task_id,
        user_id=current_user.id,
        message=response_data.message
    )
    db.add(response)
    db.commit()
    db.refresh(response)
    return response

@router.put("/{task_id}/responses/{response_id}/accept")
def accept_response(
    task_id: int,
    response_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.author_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not owned by you")
    
    response = db.query(TaskResponseModel).filter(
        TaskResponseModel.id == response_id,
        TaskResponseModel.task_id == task_id,
        TaskResponseModel.status == "pending"
    ).first()
    if not response:
        raise HTTPException(status_code=404, detail="Response not found or already processed")
    
    # Отклонить остальные отклики
    db.query(TaskResponseModel).filter(
        TaskResponseModel.task_id == task_id,
        TaskResponseModel.id != response_id,
        TaskResponseModel.status == "pending"
    ).update({"status": "rejected"})
    
    response.status = "accepted"
    task.assigned_to_id = response.user_id
    task.status = "in_progress"
    
    db.commit()
    return {"message": "Executor selected, task in progress"}