from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Task, Message, User, ProjectMessage, Project, ProjectMember
from app.auth import get_current_user
from app.schemas.chat import MessageCreate, MessageOut, ProjectMessageCreate, ProjectMessageOut
from datetime import datetime

router = APIRouter(prefix="/tasks/{task_id}/messages", tags=["chat"])

@router.post("/", response_model=MessageOut)
def send_message(
    task_id: int,
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.id not in [task.author_id, task.assigned_to_id]:
        raise HTTPException(status_code=403, detail="You are not a participant")
    
    text = message_data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    
    message = Message(task_id=task_id, user_id=current_user.id, text=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message

@router.get("/", response_model=list[MessageOut])
def get_messages(
    task_id: int,
    since: int = Query(0, description="Unix timestamp in seconds"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.id not in [task.author_id, task.assigned_to_id]:
        raise HTTPException(status_code=403, detail="You are not a participant")
    
    # Корректировка миллисекунд
    if since > 9999999999:
        since = since // 1000
    try:
        since_dt = datetime.fromtimestamp(since) if since else datetime(1970, 1, 1)
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="Invalid 'since' timestamp")
    
    messages = db.query(Message).filter(
        Message.task_id == task_id,
        Message.created_at > since_dt
    ).order_by(Message.created_at).offset(skip).limit(limit).all()
    
    return messages

@router.post("/projects/{project_id}/messages", response_model=ProjectMessageOut)
def send_project_message(
    project_id: int,
    message_data: ProjectMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Проверка участия
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this project")
    
    text = message_data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    
    message = ProjectMessage(project_id=project_id, user_id=current_user.id, text=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message

@router.get("/projects/{project_id}/messages", response_model=list[ProjectMessageOut])
def get_project_messages(
    project_id: int,
    since: int = Query(0, description="Unix timestamp in seconds"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member")
    
    if since > 9999999999:
        since = since // 1000
    try:
        since_dt = datetime.fromtimestamp(since) if since else datetime(1970, 1, 1)
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="Invalid 'since' timestamp")
    
    messages = db.query(ProjectMessage).filter(
        ProjectMessage.project_id == project_id,
        ProjectMessage.created_at > since_dt
    ).order_by(ProjectMessage.created_at).offset(skip).limit(limit).all()
    
    return messages