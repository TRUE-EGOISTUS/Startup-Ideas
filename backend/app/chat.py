from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Task, Message, User
from app.auth import get_current_user
from app.schemas.chat import MessageCreate, MessageOut
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/tasks/{task_id}/messages", tags= ["chat"])

@router.post("/", response_model=MessageOut)
def send_message(
    task_id: int,
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Проверка существования задачи
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # Проверка, что пользователь является участником задачи (автор или исполнитель)
    if current_user.id not in [task.author_id, task.assigned_to_id]:
        raise HTTPException(status_code=403, detail="You are not a participant of this task")
    
    message = Message(
        task_id = task_id,
        user_id = current_user.id,
        text=message_data.text
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message

@router.get("/", response_model=list[MessageOut])
def get_messages(
    task_id: int,
    since: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.id not in [task.author_id, task.assigned_to_id]:
        raise HTTPException(status_code=403, detail="You are not a participant")
    
    since_dt = datetime.fromtimestamp(since) if since else datetime(1970, 1, 1)
    messages = db.query(Message).filter(
        Message.task_id == task_id,
        Message.created_at > since_dt
    ).order_by(Message.created_at).all()
    
    return messages