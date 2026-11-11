from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.database import get_db, SessionLocal
from app.models import Task, Message, User, ProjectMessage, Project, ProjectMember
from app.auth import get_current_user
from app.schemas.chat import MessageCreate, MessageOut, ProjectMessageCreate, ProjectMessageOut
from app.notifications import add_notification
from datetime import datetime, timezone

router = APIRouter(prefix="/tasks/{task_id}/messages", tags=["chat"])
project_router = APIRouter(prefix="/projects", tags=["project-chat"])
task_chat_connections: dict[UUID, set[WebSocket]] = {}
project_chat_connections: dict[UUID, set[WebSocket]] = {}

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
                try:
                    payload = await websocket.receive_json()
                except (TypeError, ValueError):
                    await websocket.send_json({"type": "error", "detail": "Invalid message format"})
                    continue
                if not isinstance(payload, dict):
                    await websocket.send_json({"type": "error", "detail": "Invalid message format"})
                    continue
                text = str(payload.get("text", "")).strip()
                if not text or len(text) > 2000:
                    await websocket.send_json({"type": "error", "detail": "Message must contain 1-2000 characters"})
                    continue

                chat_message = Message(task_id=task_id, user_id=current_user.id, text=text)
                db.add(chat_message)
                recipient_id = task.author_id if current_user.id != task.author_id else task.assigned_to_id
                if recipient_id:
                    add_notification(
                        db, recipient_id, "task_message_received", "Новое сообщение по задаче",
                        f"Новое сообщение в задаче «{task.title}».", f"/tasks/{task.id}/chat",
                    )
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
                    "sender_avatar_url": chat_message.sender_avatar_url,
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
    recipient_id = task.author_id if current_user.id != task.author_id else task.assigned_to_id
    if recipient_id:
        add_notification(
            db, recipient_id, "task_message_received", "Новое сообщение по задаче",
            f"Новое сообщение в задаче «{task.title}».", f"/tasks/{task.id}/chat",
        )
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

    query = db.query(Message).options(
        joinedload(Message.user).joinedload(User.specialist_profile),
        joinedload(Message.user).joinedload(User.company_profile),
    ).filter(Message.task_id == task_id)
    if after_id is not None:
        messages = query.filter(Message.id > after_id).order_by(Message.id.asc()).limit(limit).all()
    elif before_id is not None:
        messages = query.filter(Message.id < before_id).order_by(Message.id.desc()).limit(limit).all()
        messages.reverse()
    else:
        messages = query.order_by(Message.id.desc()).limit(limit).all()
        messages.reverse()

    return messages

@project_router.websocket("/{project_id}/messages/ws")
async def project_chat_websocket(websocket: WebSocket, project_id: UUID):
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

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            await websocket.close(code=4004)
            return
        member = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id
        ).first()
        if not member:
            await websocket.close(code=4003)
            return

        await websocket.accept()
        project_chat_connections.setdefault(project_id, set()).add(websocket)
        try:
            while True:
                try:
                    payload = await websocket.receive_json()
                except (TypeError, ValueError):
                    await websocket.send_json({"type": "error", "detail": "Invalid message format"})
                    continue
                if not isinstance(payload, dict):
                    await websocket.send_json({"type": "error", "detail": "Invalid message format"})
                    continue
                text = str(payload.get("text", "")).strip()
                if not text or len(text) > 2000:
                    await websocket.send_json({"type": "error", "detail": "Message must contain 1-2000 characters"})
                    continue

                chat_message = ProjectMessage(project_id=project_id, user_id=current_user.id, text=text)
                db.add(chat_message)
                for project_member in db.query(ProjectMember).filter(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id != current_user.id,
                ).all():
                    add_notification(
                        db, project_member.user_id, "project_message_received", "Новое сообщение в проекте",
                        f"Новое сообщение в проекте «{project.name}».", f"/projects/{project.id}/chat",
                    )
                db.commit()
                db.refresh(chat_message)
                await _broadcast_project_message(project_id, {
                    "type": "message",
                    "client_id": payload.get("client_id"),
                    "id": chat_message.id,
                    "project_id": str(chat_message.project_id),
                    "user_id": chat_message.user_id,
                    "text": chat_message.text,
                    "is_announcement": chat_message.is_announcement,
                    "created_at": chat_message.created_at.isoformat(),
                    "sender_name": chat_message.sender_name,
                    "sender_avatar_url": chat_message.sender_avatar_url,
                })
        except WebSocketDisconnect:
            pass
        finally:
            project_chat_connections.get(project_id, set()).discard(websocket)
    finally:
        db.close()

async def _broadcast_project_message(project_id: UUID, payload: dict) -> None:
    connections = project_chat_connections.get(project_id, set())
    disconnected = []
    for connection in connections:
        try:
            await connection.send_json(payload)
        except Exception:
            disconnected.append(connection)
    for connection in disconnected:
        connections.discard(connection)

@project_router.post("/{project_id}/messages/announce", response_model=ProjectMessageOut)
async def announce_project_message(
    project_id: UUID,
    message_data: ProjectMessageCreate,
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
        raise HTTPException(status_code=403, detail="You are not a member of this project")
    if project.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project creator can publish announcements")

    text = message_data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")

    message = ProjectMessage(project_id=project_id, user_id=current_user.id, text=text, is_announcement=True)
    db.add(message)
    for project_member in db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id != current_user.id,
    ).all():
        add_notification(
            db, project_member.user_id, "project_announcement", "Новое объявление проекта",
            f"Новое объявление в проекте «{project.name}».", f"/projects/{project.id}/chat",
        )
    db.commit()
    db.refresh(message)
    await _broadcast_project_message(project_id, {
        "type": "announcement",
        "id": message.id,
        "project_id": str(message.project_id),
        "user_id": message.user_id,
        "text": message.text,
        "is_announcement": True,
        "created_at": message.created_at.isoformat(),
        "sender_name": message.sender_name,
        "sender_avatar_url": message.sender_avatar_url,
    })
    return message

@project_router.get("/{project_id}/announcements", response_model=list[ProjectMessageOut])
def get_project_announcements(
    project_id: UUID,
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

    return db.query(ProjectMessage).options(
        joinedload(ProjectMessage.user).joinedload(User.specialist_profile),
        joinedload(ProjectMessage.user).joinedload(User.company_profile),
    ).filter(
        ProjectMessage.project_id == project_id,
        ProjectMessage.is_announcement == True
    ).order_by(ProjectMessage.created_at.desc()).all()

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
    for project_member in db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id != current_user.id,
    ).all():
        add_notification(
            db, project_member.user_id, "project_message_received", "Новое сообщение в проекте",
            f"Новое сообщение в проекте «{project.name}».", f"/projects/{project.id}/chat",
        )
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

    query = db.query(ProjectMessage).options(
        joinedload(ProjectMessage.user).joinedload(User.specialist_profile),
        joinedload(ProjectMessage.user).joinedload(User.company_profile),
    ).filter(ProjectMessage.project_id == project_id)
    if after_id is not None:
        messages = query.filter(ProjectMessage.id > after_id).order_by(ProjectMessage.id.asc()).limit(limit).all()
    elif before_id is not None:
        messages = query.filter(ProjectMessage.id < before_id).order_by(ProjectMessage.id.desc()).limit(limit).all()
        messages.reverse()
    else:
        messages = query.order_by(ProjectMessage.id.desc()).limit(limit).all()
        messages.reverse()

    return messages