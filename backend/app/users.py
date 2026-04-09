from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal, get_db
from app.models import User, UserRole
from app.auth import get_current_user
from app.schemas.user import (
    UserRead, UserUpdate, 
    SpecialistProfileRead, CompanyProfileRead, 
    SpecialistProfileUpdate, CompanyProfileUpdate)

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    """Получить информацию о текущем пользователе"""
    return current_user

@router.put("/me", response_model=UserRead)
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
    # позже добавим обновление других полей
    db.commit()
    return current_user

@router.get("/me/profile", response_model=SpecialistProfileRead | CompanyProfileRead)
def get_my_profile(current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.SPECIALIST:
        return current_user.specialist_profile
    else:
        return current_user.company_profile

# Разделяем один эндпоинт на два для простоты и надёжности
@router.put("/me/profile/specialist", response_model=SpecialistProfileRead)
def update_specialist_profile(
    profile_data: SpecialistProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.SPECIALIST:
        raise HTTPException(status_code=403, detail="Not a specialist")
    profile = current_user.specialist_profile
    for field, value in profile_data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile

@router.put("/me/profile/company", response_model=CompanyProfileRead)
def update_company_profile(
    profile_data: CompanyProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.COMPANY:
        raise HTTPException(status_code=403, detail="Not a company")
    profile = current_user.company_profile
    for field, value in profile_data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile