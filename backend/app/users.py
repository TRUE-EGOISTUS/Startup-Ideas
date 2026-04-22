from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import SessionLocal, get_db
from app.models import User, UserRole
from app.auth import get_current_user, verify_password, get_password_hash
from app.schemas.user import (
    UserRead, UserUpdate, ChangePasswordRequest,
    SpecialistProfileRead, CompanyProfileRead, 
    SpecialistProfileUpdate, CompanyProfileUpdate)
import os
import uuid

router = APIRouter(prefix="/users", tags=["users"])

UPLOAD_DIR = "static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
    if user_data.email is not None:
        existing = db.query(User).filter(User.email == user_data.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = user_data.email
    if user_data.username is not None:
        existing = db.query(User).filter(User.username == user_data.username, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = user_data.username
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

@router.post("/me/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password changed"}

@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == UserRole.SPECIALIST:
        profile = current_user.specialist_profile
    else:
        profile = current_user.company_profile

    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)

    if current_user.role == UserRole.SPECIALIST:
        profile.avatar_url = f"/static/uploads/{filename}"
    else:
        profile.logo_url = f"/static/uploads/{filename}"

    db.commit()
    return {"url": profile.avatar_url if current_user.role == UserRole.SPECIALIST else profile.logo_url}