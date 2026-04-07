from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import SessionLocal, get_db
from app.models import User
from app.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])



# Схема для ответа (без пароля)
class UserResponse(BaseModel):
    id: int
    email: str
    is_active: bool
    # created_at: Optional[str] = None   # если есть поле created_at

# Схема для обновления профиля
class UserUpdate(BaseModel):
    email: Optional[str] = None
    # можно добавить другие поля: name, avatar и т.д.

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Получить информацию о текущем пользователе"""
    return current_user

@router.put("/me", response_model=UserResponse)
def update_me(
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить профиль текущего пользователя"""
    if user_data.email is not None:
        # Проверяем, не занят ли email другим пользователем
        existing = db.query(User).filter(
            User.email == user_data.email,
            User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = user_data.email
    # Добавьте обновление других полей по аналогии
    db.commit()
    return current_user