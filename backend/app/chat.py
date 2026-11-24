from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.database import get_db, SessionLocal
from app.models import (
    Task, Message, User, ProjectMessage, Project, ProjectMember,
    MessageReaction, ProjectMessageReaction,
)
from app.auth import get_current_user
from app.schemas.chat import MessageCreate, MessageOut, ProjectMessageCreate, ProjectMessageOut, ReactionCreate, ReactionSummary
from app.notifications import add_notification
from datetime import datetime, timezone
from typing import Any
import re
import os
import uuid

router = APIRouter(prefix="/tasks/{task_id}/messages", tags=["chat"])
project_router = APIRouter(prefix="/projects", tags=["project-chat"])
task_chat_connections: dict[UUID, set[WebSocket]] = {}


def _serialize_message(msg: Message) -> dict[str, Any]:
    """Сериализуем ORM-объект Message в dict с правильными ReactionSummary."""
    result = msg.__dict__.copy()
    result["reactions"] = _build_reaction_summaries(msg.reactions)
    result.pop("_sa_instance_state", None)
    return result


def _serialize_project_message(msg: ProjectMessage) -> dict[str, Any]:
    """Сериализуем ORM-объект ProjectMessage в dict с правильными ReactionSummary."""
    result = msg.__dict__.copy()
    result["reactions"] = _build_reaction_summaries(msg.reactions)
    result.pop("_sa_instance_state", None)
    return result
project_chat_connections: dict[UUID, set[WebSocket]] = {}

def _message_metadata(message) -> dict:
    return {
        "reply_to_id": message.reply_to_id,
        "system_type": message.system_type,
        "read_at": message.read_at.isoformat() if message.read_at else None,
        "attachment_url": message.attachment_url,
        "attachment_name": message.attachment_name,
    }

def _build_reaction_summaries(reactions) -> list[ReactionSummary]:
    if not reactions:
        return []
    grouped: dict[str, dict] = {}
    for r in reactions:
        if r.emoji not in grouped:
            grouped[r.emoji] = {"emoji": r.emoji, "count": 0, "user_ids": []}
        grouped[r.emoji]["count"] += 1
        grouped[r.emoji]["user_ids"].append(r.user_id)
    return [ReactionSummary(**v) for v in grouped.values()]

def _project_message_metadata(message) -> dict:
    return {
        "is_pinned": message.is_pinned,
        "reply_to_id": message.reply_to_id,
        "system_type": message.system_type,
        "read_at": message.read_at.isoformat() if message.read_at else None,
        "attachment_url": message.attachment_url,
        "attachment_name": message.attachment_name,
        "channel": message.channel,
    }

def _notify_mentions(db: Session, text: str, author_id: int, link: str, context: str) -> None:
    usernames = set(re.findall(r"(?<![\w@])@([A-Za-zА-Яа-яЁё0-9_.-]{2,100})", text))
    if not usernames:
        return
    mentioned_users = db.query(User).filter(User.username.in_(usernames), User.id != author_id).all()
    for mentioned_user in mentioned_users:
        add_notification(
            db,
            mentioned_user.id,
            "chat_mention",
            "Вас упомянули в чате",
            f"{context}: @{mentioned_user.username}",
            link,
        )

def _can_access_task_chat(task: Task, user: User) -> bool:
    if task.execution_mode == "classic" and task.assigned_to_id is None:
        return False
    return user.id in {task.author_id, task.assigned_to_id}

async def _broadcast_task_message(task_id: UUID, payload: dict) -> None:
    connections = task_chat_connections.get(task_id)
    if not connections:
        return
    disconnected = []
    for connection in list(connections):  # list() — защита от изменения размера во время итерации
        try:
            await connection.send_json(payload)
        except Exception:
            disconnected.append(connection)
    for connection in disconnected:
        connections.discard(connection)
    # Чистим пустые множества — утечка
    if not connections:
        task_chat_connections.pop(task_id, None)


@router.websocket("/ws")
async def task_chat_websocket(websocket: WebSocket, task_id: UUID):
    token = websocket.cookies.get("access_token")
    if not token:
        authorization = websocket.headers.get("authorization", "")
        token = authorization.removeprefix("Bearer ").strip() or None
    if not token:
        await websocket.close(code=4001)
        return

    try:
        await websocket.accept()
    except Exception:
        return

    task_chat_connections.setdefault(task_id, set()).add(websocket)
    try:
        from app.auth import get_current_user_from_token

        while True:
            try:
                raw = await websocket.receive_json()
            except (TypeError, ValueError):
                await websocket.send_json({"type": "error", "detail": "Invalid message format"})
                continue
            if not isinstance(raw, dict):
                await websocket.send_json({"type": "error", "detail": "Invalid message format"})
                continue

            # Bug 13: валидация text — None → "", убираем "None"
            raw_text = raw.get("text")
            if raw_text is None:
                raw_text = ""
            text = str(raw_text).strip()
            if not text or len(text) > 2000:
                await websocket.send_json({"type": "error", "detail": "Message must contain 1-2000 characters"})
                continue

            # Bug 13: валидация reply_to_id — int, не None/str
            raw_reply = raw.get("reply_to_id")
            reply_to_id = None
            if raw_reply is not None:
                try:
                    reply_to_id = int(raw_reply)
                except (TypeError, ValueError):
                    await websocket.send_json({"type": "error", "detail": "Invalid reply_to_id"})
                    continue

            # Bug 10 + 11: короткая сессия на каждое сообщение + проверка доступа
            db = SessionLocal()
            try:
                current_user = get_current_user_from_token(token, db)
            except HTTPException:
                db.close()
                await websocket.close(code=4001)
                return

            task = db.query(Task).filter(Task.id == task_id).first()
            if not task:
                db.close()
                await websocket.close(code=4004)
                return
            if not _can_access_task_chat(task, current_user):
                db.close()
                await websocket.close(code=4003)
                return

            if reply_to_id is not None:
                exists = db.query(Message).filter(
                    Message.id == reply_to_id, Message.task_id == task_id
                ).first()
                if not exists:
                    db.close()
                    await websocket.send_json({"type": "error", "detail": "Reply target not found"})
                    continue

            chat_message = Message(
                task_id=task_id,
                user_id=current_user.id,
                text=text,
                reply_to_id=reply_to_id,
            )
            db.add(chat_message)
            db.commit()
            db.refresh(chat_message)

            # Bug 16: помечаем чужие сообщения как прочитанные при получении
            try:
                db.query(Message).filter(
                    Message.task_id == task_id,
                    Message.user_id != current_user.id,
                    Message.read_at.is_(None),
                ).update({"read_at": datetime.now(timezone.utc)}, synchronize_session=False)
                db.commit()
            except Exception:
                pass

            # Bug 11: try/except вокруг уведомлений и broadcast
            try:
                recipient_id = task.author_id if current_user.id != task.author_id else task.assigned_to_id
                if recipient_id:
                    add_notification(
                        db, recipient_id, "task_message_received", "Новое сообщение по задаче",
                        f"Новое сообщение в задаче «{task.title}».", f"/tasks/{task.id}/chat",
                    )
                _notify_mentions(db, text, current_user.id, f"/tasks/{task.id}/chat", "Упоминание в задаче")
                db.commit()
                db.refresh(chat_message)
            except Exception:
                # Не теряем сообщение — оно уже сохранено
                pass

            await _broadcast_task_message(task_id, {
                "type": "message",
                "client_id": raw.get("client_id"),
                "id": chat_message.id,
                "task_id": str(chat_message.task_id),
                "user_id": chat_message.user_id,
                "text": chat_message.text,
                "created_at": chat_message.created_at.isoformat(),
                "sender_name": chat_message.sender_name,
                "sender_avatar_url": chat_message.sender_avatar_url,
                **_message_metadata(chat_message),
            })
    except WebSocketDisconnect:
        pass
    finally:
        task_chat_connections.get(task_id, set()).discard(websocket)

@router.post("/", response_model=MessageOut)
async def send_message(
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
    
    if message_data.reply_to_id is not None and not db.query(Message).filter(
        Message.id == message_data.reply_to_id, Message.task_id == task_id
    ).first():
        raise HTTPException(status_code=400, detail="Reply target not found")
    message = Message(task_id=task_id, user_id=current_user.id, text=text, reply_to_id=message_data.reply_to_id)
    db.add(message)
    recipient_id = task.author_id if current_user.id != task.author_id else task.assigned_to_id
    if recipient_id:
        add_notification(
            db, recipient_id, "task_message_received", "Новое сообщение по задаче",
            f"Новое сообщение в задаче «{task.title}».", f"/tasks/{task.id}/chat",
        )
    _notify_mentions(db, text, current_user.id, f"/tasks/{task.id}/chat", "Упоминание в задаче")
    db.commit()
    db.refresh(message)
    # Рассылка по WebSocket после сохранения сообщения по HTTP
    await _broadcast_task_message(task_id, {
        "type": "message",
        "id": message.id,
        "task_id": str(message.task_id),
        "user_id": message.user_id,
        "text": message.text,
        "created_at": message.created_at.isoformat(),
        "sender_name": message.sender_name,
        "sender_avatar_url": message.sender_avatar_url,
        **_message_metadata(message),
    })
    return _serialize_message(message)

@router.post("/read")
def mark_task_messages_read(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or not _can_access_task_chat(task, current_user):
        raise HTTPException(status_code=403, detail="You are not a participant")
    now = datetime.now(timezone.utc)
    db.query(Message).filter(
        Message.task_id == task_id,
        Message.user_id != current_user.id,
        Message.read_at.is_(None),
    ).update({"read_at": now}, synchronize_session=False)
    db.commit()
    return {"read_at": now.isoformat()}

@router.get("/", response_model=list[MessageOut])
def get_messages(
    task_id: UUID,
    after_id: int | None = Query(None, ge=0),
    before_id: int | None = Query(None, ge=0),
    search: str | None = Query(None, min_length=1, max_length=100),
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
        joinedload(Message.reactions),
    ).filter(Message.task_id == task_id)
    if search:
        query = query.filter(Message.text.ilike(f"%{search.strip()}%"))
    if after_id is not None:
        messages = query.filter(Message.id > after_id).order_by(Message.id.asc()).limit(limit).all()
    elif before_id is not None:
        messages = query.filter(Message.id < before_id).order_by(Message.id.desc()).limit(limit).all()
        messages.reverse()
    else:
        messages = query.order_by(Message.id.desc()).limit(limit).all()
        messages.reverse()

    result = []
    for msg in messages:
        msg_dict = msg.__dict__.copy()
        msg_dict["reactions"] = _build_reaction_summaries(msg.reactions)
        # Достаём @property, которых нет в __dict__
        msg_dict["sender_name"] = msg.sender_name
        msg_dict["sender_avatar_url"] = msg.sender_avatar_url
        if "reactions" in msg_dict:
            del msg_dict["_sa_instance_state"]
        result.append(msg_dict)
    return result

@project_router.websocket("/{project_id}/messages/ws")
async def project_chat_websocket(websocket: WebSocket, project_id: UUID):
    token = websocket.cookies.get("access_token")
    if not token:
        authorization = websocket.headers.get("authorization", "")
        token = authorization.removeprefix("Bearer ").strip() or None
    if not token:
        await websocket.close(code=4001)
        return

    try:
        await websocket.accept()
    except Exception:
        return

    project_chat_connections.setdefault(project_id, set()).add(websocket)
    try:
        from app.auth import get_current_user_from_token

        while True:
            try:
                raw = await websocket.receive_json()
            except (TypeError, ValueError):
                await websocket.send_json({"type": "error", "detail": "Invalid message format"})
                continue
            if not isinstance(raw, dict):
                await websocket.send_json({"type": "error", "detail": "Invalid message format"})
                continue

            # Bug 13: валидация text — None → "", убираем "None"
            raw_text = raw.get("text")
            if raw_text is None:
                raw_text = ""
            text = str(raw_text).strip()
            if not text or len(text) > 2000:
                await websocket.send_json({"type": "error", "detail": "Message must contain 1-2000 characters"})
                continue

            # Bug 13: валидация reply_to_id — int, не None/str
            raw_reply = raw.get("reply_to_id")
            reply_to_id = None
            if raw_reply is not None:
                try:
                    reply_to_id = int(raw_reply)
                except (TypeError, ValueError):
                    await websocket.send_json({"type": "error", "detail": "Invalid reply_to_id"})
                    continue

            channel = _validate_channel(raw.get("channel"))

            # Bug 10 + 11: короткая сессия на каждое сообщение + проверка доступа
            db = SessionLocal()
            try:
                current_user = get_current_user_from_token(token, db)
            except HTTPException:
                db.close()
                await websocket.close(code=4001)
                return

            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                db.close()
                await websocket.close(code=4004)
                return
            member = db.query(ProjectMember).filter(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id
            ).first()
            if not member:
                db.close()
                await websocket.close(code=4003)
                return

            if reply_to_id is not None:
                exists = db.query(ProjectMessage).filter(
                    ProjectMessage.id == reply_to_id, ProjectMessage.project_id == project_id
                ).first()
                if not exists:
                    db.close()
                    await websocket.send_json({"type": "error", "detail": "Reply target not found"})
                    continue

            chat_message = ProjectMessage(
                project_id=project_id,
                user_id=current_user.id,
                text=text,
                reply_to_id=reply_to_id,
                channel=channel,
            )
            db.add(chat_message)
            db.commit()
            db.refresh(chat_message)

            # Bug 16: помечаем чужие сообщения как прочитанные при получении
            try:
                db.query(ProjectMessage).filter(
                    ProjectMessage.project_id == project_id,
                    ProjectMessage.user_id != current_user.id,
                    ProjectMessage.read_at.is_(None),
                ).update({"read_at": datetime.now(timezone.utc)}, synchronize_session=False)
                db.commit()
            except Exception:
                pass

            # Bug 11: try/except вокруг уведомлений и broadcast
            try:
                for project_member in db.query(ProjectMember).filter(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id != current_user.id,
                ).all():
                    add_notification(
                        db, project_member.user_id, "project_message_received", "Новое сообщение в проекте",
                        f"Новое сообщение в проекте «{project.name}».", f"/projects/{project.id}/chat",
                    )
                _notify_mentions(db, text, current_user.id, f"/projects/{project.id}/chat", "Упоминание в проекте")
                db.commit()
                db.refresh(chat_message)
            except Exception:
                pass

            await _broadcast_project_message(project_id, {
                "type": "message",
                "client_id": raw.get("client_id"),
                "id": chat_message.id,
                "project_id": str(chat_message.project_id),
                "user_id": chat_message.user_id,
                "text": chat_message.text,
                "is_announcement": chat_message.is_announcement,
                "is_pinned": chat_message.is_pinned,
                "created_at": chat_message.created_at.isoformat(),
                "sender_name": chat_message.sender_name,
                "sender_avatar_url": chat_message.sender_avatar_url,
                **_project_message_metadata(chat_message),
            })
    except WebSocketDisconnect:
        pass
    finally:
        project_chat_connections.get(project_id, set()).discard(websocket)

async def _broadcast_project_message(project_id: UUID, payload: dict) -> None:
    connections = project_chat_connections.get(project_id)
    if not connections:
        return
    disconnected = []
    for connection in list(connections):  # list() — защита от изменения размера во время итерации
        try:
            await connection.send_json(payload)
        except Exception:
            disconnected.append(connection)
    for connection in disconnected:
        connections.discard(connection)
    # Чистим пустые множества — утечка
    if not connections:
        project_chat_connections.pop(project_id, None)

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

    message = ProjectMessage(project_id=project_id, user_id=current_user.id, text=text, is_announcement=True, channel="announcements")
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
        "channel": message.channel,
        "is_announcement": True,
        "created_at": message.created_at.isoformat(),
        "sender_name": message.sender_name,
        "sender_avatar_url": message.sender_avatar_url,
        **_project_message_metadata(message),
    })
    return _serialize_project_message(message)

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
    ).order_by(ProjectMessage.is_pinned.desc(), ProjectMessage.created_at.desc()).all()
    return [_serialize_project_message(msg) for msg in messages]

@project_router.post("/{project_id}/messages", response_model=ProjectMessageOut)
async def send_project_message(
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
    
    if message_data.reply_to_id is not None and not db.query(ProjectMessage).filter(
        ProjectMessage.id == message_data.reply_to_id, ProjectMessage.project_id == project_id
    ).first():
        raise HTTPException(status_code=400, detail="Reply target not found")
    channel = _validate_channel(message_data.channel)
    message = ProjectMessage(project_id=project_id, user_id=current_user.id, text=text, reply_to_id=message_data.reply_to_id, channel=channel)
    db.add(message)
    for project_member in db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id != current_user.id,
    ).all():
        add_notification(
            db, project_member.user_id, "project_message_received", "Новое сообщение в проекте",
            f"Новое сообщение в проекте «{project.name}».", f"/projects/{project.id}/chat",
        )
    _notify_mentions(db, text, current_user.id, f"/projects/{project.id}/chat", "Упоминание в проекте")
    db.commit()
    db.refresh(message)
    # Рассылка по WebSocket после сохранения сообщения по HTTP
    await _broadcast_project_message(project_id, {
        "type": "message",
        "id": message.id,
        "project_id": str(message.project_id),
        "user_id": message.user_id,
        "text": message.text,
        "created_at": message.created_at.isoformat(),
        "sender_name": message.sender_name,
        "sender_avatar_url": message.sender_avatar_url,
        "channel": message.channel,
        **_project_message_metadata(message),
    })
    return _serialize_project_message(message)

@project_router.post("/{project_id}/messages/read")
def mark_project_messages_read(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member")
    now = datetime.now(timezone.utc)
    db.query(ProjectMessage).filter(
        ProjectMessage.project_id == project_id,
        ProjectMessage.user_id != current_user.id,
        ProjectMessage.read_at.is_(None),
    ).update({"read_at": now}, synchronize_session=False)
    db.commit()
    return {"read_at": now.isoformat()}

@project_router.post("/{project_id}/messages/{message_id}/pin", response_model=ProjectMessageOut)
async def pin_project_message(
    project_id: UUID,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project creator can pin announcements")
    message = db.query(ProjectMessage).filter(
        ProjectMessage.id == message_id,
        ProjectMessage.project_id == project_id,
        ProjectMessage.is_announcement.is_(True),
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Announcement not found")
    message.is_pinned = not message.is_pinned
    db.commit()
    db.refresh(message)
    # Рассылка по WebSocket после закрепления
    await _broadcast_project_message(project_id, {
        "type": "message",
        "id": message.id,
        "project_id": str(message.project_id),
        "user_id": message.user_id,
        "text": message.text,
        "created_at": message.created_at.isoformat(),
        "sender_name": message.sender_name,
        "sender_avatar_url": message.sender_avatar_url,
        "channel": message.channel,
        "is_announcement": message.is_announcement,
        "is_pinned": message.is_pinned,
        **_project_message_metadata(message),
    })
    return _serialize_project_message(message)

@project_router.get("/{project_id}/messages", response_model=list[ProjectMessageOut])
def get_project_messages(
    project_id: UUID,
    after_id: int | None = Query(None, ge=0),
    before_id: int | None = Query(None, ge=0),
    search: str | None = Query(None, min_length=1, max_length=100),
    channel: str | None = Query(None, min_length=1, max_length=40),
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
        joinedload(ProjectMessage.reactions),
    ).filter(ProjectMessage.project_id == project_id)
    if channel:
        query = query.filter(ProjectMessage.channel == _validate_channel(channel))
    if search:
        query = query.filter(ProjectMessage.text.ilike(f"%{search.strip()}%"))
    if after_id is not None:
        messages = query.filter(ProjectMessage.id > after_id).order_by(ProjectMessage.id.asc()).limit(limit).all()
    elif before_id is not None:
        messages = query.filter(ProjectMessage.id < before_id).order_by(ProjectMessage.id.desc()).limit(limit).all()
        messages.reverse()
    else:
        messages = query.order_by(ProjectMessage.id.desc()).limit(limit).all()
        messages.reverse()

    result = []
    for msg in messages:
        msg_dict = msg.__dict__.copy()
        msg_dict["reactions"] = _build_reaction_summaries(msg.reactions)
        # Достаём @property, которых нет в __dict__
        msg_dict["sender_name"] = msg.sender_name
        msg_dict["sender_avatar_url"] = msg.sender_avatar_url
        if "reactions" in msg_dict:
            del msg_dict["_sa_instance_state"]
        result.append(msg_dict)
    return result

def _validate_emoji(emoji: str) -> str:
    value = emoji.strip()
    if not value or len(value) > 16:
        raise HTTPException(status_code=400, detail="Invalid reaction")
    return value

def _validate_channel(channel: str | None) -> str:
    value = (channel or "general").strip().lower()
    if not re.fullmatch(r"[a-z0-9_-]{1,40}", value):
        raise HTTPException(status_code=400, detail="Invalid channel")
    return value

# Белый список разрешённых расширений (изображения + документы)
CHAT_ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "webp",
    "pdf", "doc", "docx", "txt", "rtf",
    "csv", "xls", "xlsx",
    "zip", "rar", "7z",
}
CHAT_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _validate_filename(filename: str) -> str:
    """Проверяем расширение и очищаем имя файла."""
    if not filename:
        raise HTTPException(status_code=400, detail="File name is required")
    safe_name = os.path.basename(filename).replace("\x00", "")
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
    if ext not in CHAT_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '.{ext}' is not allowed")
    return safe_name


async def _store_chat_attachment(file: UploadFile) -> tuple[str, str]:
    """Сохраняет вложение чата: читает чанками, проверяет расширение и размер."""
    safe_name = _validate_filename(file.filename)
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""

    directory = "static/uploads/chat"
    os.makedirs(directory, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(directory, filename)

    written = 0
    while True:
        chunk = await file.read(1024 * 256)  # 256 KB chunks
        if not chunk:
            break
        written += len(chunk)
        if written > CHAT_MAX_FILE_SIZE:
            # Чистим частично записанный файл при превышении лимита
            if os.path.exists(filepath):
                os.remove(filepath)
            raise HTTPException(status_code=413, detail="File is too large (max 10 MB)")
        with open(filepath, "ab") as target:
            target.write(chunk)

    if written == 0:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=400, detail="Empty file")

    return f"/static/uploads/chat/{filename}", safe_name

@router.post("/{message_id}/reactions")
async def toggle_task_reaction(
    task_id: UUID,
    message_id: int,
    reaction_data: ReactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or not _can_access_task_chat(task, current_user):
        raise HTTPException(status_code=403, detail="You are not a participant")
    message = db.query(Message).filter(Message.id == message_id, Message.task_id == task_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    emoji = _validate_emoji(reaction_data.emoji)
    reaction = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == current_user.id,
        MessageReaction.emoji == emoji,
    ).first()
    active = reaction is None
    if reaction:
        db.delete(reaction)
    else:
        db.add(MessageReaction(message_id=message_id, user_id=current_user.id, emoji=emoji))
    db.commit()
    payload = {"type": "reaction", "message_id": message_id, "emoji": emoji, "user_id": current_user.id, "active": active}
    await _broadcast_task_message(task_id, payload)
    return payload

@router.post("/{message_id}/attachment", response_model=MessageOut)
async def upload_task_attachment(
    task_id: UUID,
    message_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or not _can_access_task_chat(task, current_user):
        raise HTTPException(status_code=403, detail="You are not a participant")
    message = db.query(Message).filter(
        Message.id == message_id, Message.task_id == task_id, Message.user_id == current_user.id
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    message.attachment_url, message.attachment_name = await _store_chat_attachment(file)
    db.commit()
    db.refresh(message)
    # Рассылка по WebSocket после загрузки вложения
    await _broadcast_task_message(task_id, {
        "type": "message",
        "id": message.id,
        "task_id": str(message.task_id),
        "user_id": message.user_id,
        "text": message.text,
        "created_at": message.created_at.isoformat(),
        "sender_name": message.sender_name,
        "sender_avatar_url": message.sender_avatar_url,
        **_message_metadata(message),
    })
    return _serialize_message(message)

@project_router.post("/{project_id}/messages/{message_id}/reactions")
async def toggle_project_reaction(
    project_id: UUID,
    message_id: int,
    reaction_data: ReactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member")
    message = db.query(ProjectMessage).filter(
        ProjectMessage.id == message_id, ProjectMessage.project_id == project_id
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    emoji = _validate_emoji(reaction_data.emoji)
    reaction = db.query(ProjectMessageReaction).filter(
        ProjectMessageReaction.message_id == message_id,
        ProjectMessageReaction.user_id == current_user.id,
        ProjectMessageReaction.emoji == emoji,
    ).first()
    active = reaction is None
    if reaction:
        db.delete(reaction)
    else:
        db.add(ProjectMessageReaction(message_id=message_id, user_id=current_user.id, emoji=emoji))
    db.commit()
    payload = {"type": "reaction", "message_id": message_id, "emoji": emoji, "user_id": current_user.id, "active": active}
    await _broadcast_project_message(project_id, payload)
    return payload

@project_router.post("/{project_id}/messages/{message_id}/attachment", response_model=ProjectMessageOut)
async def upload_project_attachment(
    project_id: UUID,
    message_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id, ProjectMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member")
    message = db.query(ProjectMessage).filter(
        ProjectMessage.id == message_id, ProjectMessage.project_id == project_id, ProjectMessage.user_id == current_user.id
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    message.attachment_url, message.attachment_name = await _store_chat_attachment(file)
    db.commit()
    db.refresh(message)
    # Рассылка по WebSocket после загрузки вложения
    await _broadcast_project_message(project_id, {
        "type": "message",
        "id": message.id,
        "project_id": str(message.project_id),
        "user_id": message.user_id,
        "text": message.text,
        "created_at": message.created_at.isoformat(),
        "sender_name": message.sender_name,
        "sender_avatar_url": message.sender_avatar_url,
        "channel": message.channel,
        **_project_message_metadata(message),
    })
    return _serialize_project_message(message)