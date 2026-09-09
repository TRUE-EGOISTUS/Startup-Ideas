from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import User, UserRole
from app.auth import get_current_user, verify_password, get_password_hash
from app.schemas.user import (
    UserRead, UserUpdate, ChangePasswordRequest,
    SpecialistProfileRead, CompanyProfileRead, 
    SpecialistProfileUpdate, CompanyProfileUpdate,
    PublicUserRead)
import os
import uuid

router = APIRouter(prefix="/users", tags=["users"])

UPLOAD_DIR = "static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def remove_uploaded_file(image_url: str | None) -> None:
    if not image_url or not image_url.startswith("/static/uploads/"):
        return
    filename = os.path.basename(image_url)
    filepath = os.path.join(UPLOAD_DIR, filename)
    if os.path.isfile(filepath):
        os.remove(filepath)

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
    current_user.token_version += 1
    db.commit()
    return {"message": "Password changed"}

@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    image_type: str = Form("avatar"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ALLOWED_EXTENSIONS = {"image/jpeg", "image/png"}
    MAX_SIZE = 5 * 1024 * 1024  # 5MB

    if file.content_type not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    # Читаем содержимое, сразу контролируя размер
    content = await file.read(MAX_SIZE + 1)
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    if image_type not in {"avatar", "cover"}:
        raise HTTPException(status_code=400, detail="Unsupported profile image type")

    # Определяем расширение из content_type
    ext = "jpg" if file.content_type == "image/jpeg" else "png"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    image_url = f"/static/uploads/{filename}"
    if current_user.role == UserRole.SPECIALIST:
        profile = current_user.specialist_profile
        if image_type == "avatar":
            remove_uploaded_file(profile.avatar_url)
            profile.avatar_url = image_url
        else:
            remove_uploaded_file(profile.cover_url)
            profile.cover_url = image_url
    else:
        profile = current_user.company_profile
        if image_type == "avatar":
            remove_uploaded_file(profile.logo_url)
            profile.logo_url = image_url
        else:
            remove_uploaded_file(profile.cover_url)
            profile.cover_url = image_url
    
    db.commit()
    return {"image_url": image_url, "image_type": image_type}

@router.get("/{user_id}", response_model=PublicUserRead)
def get_user_public(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user = db.query(User).options(
        selectinload(User.specialist_profile),
        selectinload(User.company_profile)
    ).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user