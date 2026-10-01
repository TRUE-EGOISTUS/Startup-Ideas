from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, joinedload
from app.database import get_db, SessionLocal
from app.models import Task, Message, User, ProjectMessage, Project, ProjectMember
from app.auth import get_current_user
from app.schemas.chat import MessageCreate, MessageOut, ProjectMessageCreate, ProjectMessageOut
from datetime import datetime, timezone

router = APIRouter(prefix="/tasks/{task_id}/messages", tags=["chat"])
project_router = APIRouter(prefix="/projects", tags=["project-chat"])
task_chat_connections: dict[UUID, set[WebSocket]] = {}

def _can_access_task_chat(task: Task, user: User) -> bool:
    if task.execution_mode == "classic" and task.assigned_to_id is None:
        return False
    return user.id in {task.author_id, task.assigned_to_id}

async def _broadcast_task_message(task_id: UUID, payload: dict) -> None:
    connections = task_chat_connections.get(task_id, set())
    disconnected = []
    for connection in connections:
        try:
            await connection.send_json(payload)
        except Exception:
            disconnected.append(connection)
    for connection in disconnected:
        connections.discard(connection)

@router.websocket("/ws")
async def task_chat_websocket(websocket: WebSocket, task_id: UUID):
    token = websocket.cookies.get("access_token")
    if not token:
        authorization = websocket.headers.get("authorization", "")
        token = authorization.removeprefix("Bearer ").strip() or None
    if not token:
        await websocket.close(code=4001)
        return

    db = SessionLocal()
    try:
        from app.auth import get_current_user_from_token
        try:
            current_user = get_current_user_from_token(token, db)
        except HTTPException:
            await websocket.close(code=4001)
            return

        task = db.query(Task).filter(Task.id == task_id).first()
        if not task or not _can_access_task_chat(task, current_user):
            await websocket.close(code=4003)
            return

        await websocket.accept()
        task_chat_connections.setdefault(task_id, set()).add(websocket)
        try:
            while True:
                payload = await websocket.receive_json()
                text = str(payload.get("text", "")).strip()
                if not text or len(text) > 2000:
                    await websocket.send_json({"type": "error", "detail": "Message must contain 1-2000 characters"})
                    continue

                chat_message = Message(task_id=task_id, user_id=current_user.id, text=text)
                db.add(chat_message)
                db.commit()
                db.refresh(chat_message)
                await _broadcast_task_message(task_id, {
                    "type": "message",
                    "client_id": payload.get("client_id"),
                    "id": chat_message.id,
                    "task_id": str(chat_message.task_id),
                    "user_id": chat_message.user_id,
                    "text": chat_message.text,
                    "created_at": chat_message.created_at.isoformat(),
                    "sender_name": chat_message.sender_name,
                })
        except WebSocketDisconnect:
            pass
        finally:
            task_chat_connections.get(task_id, set()).discard(websocket)
    finally:
        db.close()

@router.post("/", response_model=MessageOut)
def send_message(
    task_id: UUID,
    message_data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task_chat(task, current_user):
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
    task_id: UUID,
    after_id: int | None = Query(None, ge=0),
    before_id: int | None = Query(None, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task_chat(task, current_user):
        raise HTTPException(status_code=403, detail="You are not a participant")
    
    if after_id is not None and before_id is not None:
        raise HTTPException(status_code=400, detail="Use either after_id or before_id")

    query = db.query(Message).options(joinedload(Message.user)).filter(Message.task_id == task_id)
    if after_id is not None:
        messages = query.filter(Message.id > after_id).order_by(Message.id.asc()).limit(limit).all()
    elif before_id is not None:
        messages = query.filter(Message.id < before_id).order_by(Message.id.desc()).limit(limit).all()
        messages.reverse()
    else:
        messages = query.order_by(Message.id.desc()).limit(limit).all()
        messages.reverse()

    return messages

@project_router.post("/{project_id}/messages", response_model=ProjectMessageOut)
def send_project_message(
    project_id: UUID,
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

@project_router.get("/{project_id}/messages", response_model=list[ProjectMessageOut])
def get_project_messages(
    project_id: UUID,
    after_id: int | None = Query(None, ge=0),
    before_id: int | None = Query(None, ge=0),
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
    
    if after_id is not None and before_id is not None:
        raise HTTPException(status_code=400, detail="Use either after_id or before_id")

    query = db.query(ProjectMessage).options(joinedload(ProjectMessage.user)).filter(ProjectMessage.project_id == project_id)
    if after_id is not None:
        messages = query.filter(ProjectMessage.id > after_id).order_by(ProjectMessage.id.asc()).limit(limit).all()
    elif before_id is not None:
        messages = query.filter(ProjectMessage.id < before_id).order_by(ProjectMessage.id.desc()).limit(limit).all()
        messages.reverse()
    else:
        messages = query.order_by(ProjectMessage.id.desc()).limit(limit).all()
        messages.reverse()

    return messages