from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Notification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationRead(BaseModel):
    id: int
    notification_type: str
    title: str
    message: str
    link: str | None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


def add_notification(
    db: Session,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    link: str | None = None,
) -> None:
    db.add(Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        link=link,
    ))


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    total = query.count()
    response.headers["X-Total-Count"] = str(total)
    return (
        query
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/unread-count")
def unread_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read.is_(False),
    ).count()
    return {"count": count}


@router.get("/counts")
def notification_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_query = db.query(Notification).filter(Notification.user_id == current_user.id)
    return {
        "total": base_query.count(),
        "unread": base_query.filter(Notification.is_read.is_(False)).count(),
    }


@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"message": "Notifications marked as read"}


@router.delete("")
def clear_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(Notification.user_id == current_user.id).delete(
        synchronize_session=False
    )
    db.commit()
    return {"message": "Notifications cleared"}
