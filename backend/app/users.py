from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response
from pydantic import EmailStr
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import User, UserRole, VerificationStatus, CompanyProfile, ModeratorInvitation
from app.auth import (
    get_current_user,
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
)
from app.config import settings
from app.schemas.user import (
    UserRead, UserUpdate, ChangePasswordRequest,
    SpecialistProfileRead, CompanyProfileRead, 
    SpecialistProfileUpdate, CompanyProfileUpdate,
    PublicUserRead, AdminCompanyRead, AdminUserRead)
from app.auth import send_moderator_invitation_email
from app.notifications import add_notification
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import os
import uuid

router = APIRouter(prefix="/users", tags=["users"])

def require_superuser(current_user: User = Depends(get_current_user)) -> User:
    if not (current_user.is_superuser or current_user.can_moderate_companies):
        raise HTTPException(status_code=403, detail="Administrator access required")
    return current_user

def require_superuser_only(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser access required")
    return current_user

def _invitation_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

@router.post("/admin/moderator-invitations")
def create_moderator_invitation(
    email: EmailStr,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser_only),
):
    normalized_email = email.strip().lower()
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="This email already belongs to a registered user")

    token = secrets.token_urlsafe(32)
    invitation = ModeratorInvitation(
        email=normalized_email,
        token_hash=_invitation_hash(token),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=2),
        created_by_id=_.id,
    )
    db.add(invitation)
    db.commit()
    try:
        send_moderator_invitation_email(normalized_email, token)
    except (RuntimeError, OSError):
        db.delete(invitation)
        db.commit()
        raise HTTPException(status_code=503, detail="Could not send moderator invitation")
    return {"message": "Invitation sent"}

@router.get("/admin/moderator-candidates")
def list_moderator_candidates(
    search: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser_only),
):
    query = db.query(User).filter(
        User.role == UserRole.SPECIALIST,
        User.is_active.is_(True),
        User.is_verified.is_(True),
        User.is_superuser.is_(False),
        User.can_moderate_companies.is_(False),
    )
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter((User.email.ilike(pattern)) | (User.username.ilike(pattern)))
    return query.order_by(User.username.asc()).limit(100).all()

@router.post("/admin/moderators/{user_id}/grant")
def grant_moderator_access(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser_only),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != UserRole.SPECIALIST:
        raise HTTPException(status_code=400, detail="Only specialists can become moderators")
    if not user.is_active or not user.is_verified:
        raise HTTPException(status_code=400, detail="User must be active and have a verified email")
    if user.is_superuser:
        raise HTTPException(status_code=400, detail="Superuser does not need moderator access")
    user.can_moderate_companies = True
    add_notification(
        db, user.id, "moderator_granted", "Права модератора назначены",
        "Вам доступны функции модерации компаний.", "/admin/company-verifications",
    )
    db.commit()
    return {"message": "Moderator access granted"}

@router.get("/admin/moderators")
def list_moderators(
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    moderators = db.query(User).filter(User.can_moderate_companies.is_(True)).order_by(User.created_at.desc()).all()
    invitations = db.query(ModeratorInvitation).order_by(ModeratorInvitation.id.desc()).all()
    return {
        "moderators": [
            {
                "id": moderator.id,
                "email": moderator.email,
                "username": moderator.username,
                "is_active": moderator.is_active,
                "created_at": moderator.created_at,
            }
            for moderator in moderators
        ],
        "invitations": [
            {
                "id": invitation.id,
                "email": invitation.email,
                "expires_at": invitation.expires_at,
                "accepted_at": invitation.accepted_at,
                "expired": invitation.expires_at <= datetime.now(timezone.utc).replace(tzinfo=None),
            }
            for invitation in invitations
            if invitation.accepted_at is None
        ],
    }

@router.post("/admin/moderator-invitations/{invitation_id}/resend")
def resend_moderator_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_superuser_only),
):
    invitation = db.query(ModeratorInvitation).filter(
        ModeratorInvitation.id == invitation_id,
        ModeratorInvitation.accepted_at.is_(None),
    ).first()
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    token = secrets.token_urlsafe(32)
    invitation.token_hash = _invitation_hash(token)
    invitation.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=2)
    try:
        send_moderator_invitation_email(invitation.email, token)
        db.commit()
    except (RuntimeError, OSError):
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not send moderator invitation")
    return {"message": "Invitation resent"}

@router.delete("/admin/moderator-invitations/{invitation_id}")
def revoke_moderator_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser_only),
):
    invitation = db.query(ModeratorInvitation).filter(
        ModeratorInvitation.id == invitation_id,
        ModeratorInvitation.accepted_at.is_(None),
    ).first()
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    db.delete(invitation)
    db.commit()
    return {"message": "Invitation revoked"}

@router.post("/admin/moderators/{user_id}/revoke")
def revoke_moderator(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser_only),
):
    moderator = db.query(User).filter(
        User.id == user_id,
        User.can_moderate_companies.is_(True),
        User.is_superuser.is_(False),
    ).first()
    if moderator is None:
        raise HTTPException(status_code=404, detail="Moderator not found")
    moderator.can_moderate_companies = False
    moderator.token_version += 1
    add_notification(
        db, moderator.id, "moderator_revoked", "Права модератора отозваны",
        "Права модератора больше недоступны.", "/",
    )
    db.commit()
    return {"message": "Moderator access revoked"}

@router.post("/accept-moderator-invitation", response_model=UserRead)
def accept_moderator_invitation(
    token: str,
    username: str = Query(..., min_length=3, max_length=100),
    password: str = Query(..., min_length=8),
    db: Session = Depends(get_db),
):
    invitation = db.query(ModeratorInvitation).filter(
        ModeratorInvitation.token_hash == _invitation_hash(token),
        ModeratorInvitation.accepted_at.is_(None),
        ModeratorInvitation.expires_at > datetime.now(timezone.utc).replace(tzinfo=None),
    ).first()
    if invitation is None:
        raise HTTPException(status_code=400, detail="Invitation is invalid or expired")
    if db.query(User).filter(User.email == invitation.email).first():
        raise HTTPException(status_code=400, detail="Email is already registered")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=invitation.email,
        username=username,
        hashed_password=get_password_hash(password),
        role=UserRole.SPECIALIST,
        is_verified=True,
        is_active=True,
        can_moderate_companies=True,
        verification_status=VerificationStatus.VERIFIED.value,
    )
    db.add(user)
    db.flush()
    db.add(SpecialistProfile(user_id=user.id))
    invitation.accepted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(user)
    return user

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

@router.get("/admin/company-verifications", response_model=list[AdminCompanyRead])
def list_company_verifications(
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
    status: str = Query(VerificationStatus.PENDING.value, pattern="^(pending|verified|rejected)$"),
    search: str | None = Query(None, max_length=100),
):
    query = (
        db.query(User)
        .outerjoin(CompanyProfile, CompanyProfile.user_id == User.id)
        .options(
            selectinload(User.specialist_profile),
            selectinload(User.company_profile),
        )
        .filter(
            User.role == UserRole.COMPANY,
        )
    )
    query = query.filter(User.verification_status == status)
    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            (User.email.ilike(search_pattern))
            | (User.username.ilike(search_pattern))
            | (CompanyProfile.company_name.ilike(search_pattern))
        )
    return query.order_by(User.created_at.asc()).all()

@router.get("/admin/accounts", response_model=list[AdminUserRead])
def list_admin_accounts(
    db: Session = Depends(get_db),
    admin: User = Depends(require_superuser),
    search: str | None = Query(None, max_length=100),
    role: str | None = Query(None, pattern="^(specialist|company)$"),
):
    query = db.query(User).filter(User.id != admin.id)
    if role:
        query = query.filter(User.role == role)
    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter((User.email.ilike(search_pattern)) | (User.username.ilike(search_pattern)))
    return query.order_by(User.created_at.desc()).limit(200).all()

@router.post("/admin/company-verifications/{user_id}/approve", response_model=UserRead)
def approve_company_verification(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.role == UserRole.COMPANY,
    ).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Company not found")
    user.verification_status = VerificationStatus.VERIFIED.value
    user.verification_rejection_reason = None
    add_notification(
        db, user.id, "company_approved", "Компания подтверждена",
        "Профиль компании прошел проверку. Теперь доступны все функции проекта.", "/profile",
    )
    db.commit()
    db.refresh(user)
    return user

@router.post("/admin/company-verifications/{user_id}/reject", response_model=UserRead)
def reject_company_verification(
    user_id: int,
    reason: str = Query(..., min_length=3, max_length=1000),
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.role == UserRole.COMPANY,
    ).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Company not found")
    user.verification_status = VerificationStatus.REJECTED.value
    user.verification_rejection_reason = reason.strip()
    add_notification(
        db, user.id, "company_rejected", "Профиль компании отклонен",
        f"Причина: {user.verification_rejection_reason}", "/profile",
    )
    db.commit()
    db.refresh(user)
    return user

@router.post("/admin/company-verifications/{user_id}/resubmit", response_model=AdminCompanyRead)
def resubmit_company_verification(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.role == UserRole.COMPANY,
        User.verification_status == VerificationStatus.REJECTED.value,
    ).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Rejected company not found")
    user.verification_status = VerificationStatus.PENDING.value
    user.verification_rejection_reason = None
    add_notification(
        db, user.id, "company_resubmitted", "Профиль отправлен на повторную проверку",
        "Модератор рассмотрит обновленный профиль.", "/profile",
    )
    db.commit()
    db.refresh(user)
    return user

@router.post("/admin/accounts/{user_id}/block", response_model=AdminUserRead)
def block_account(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_superuser:
        raise HTTPException(status_code=400, detail="Administrator accounts cannot be blocked")
    user.is_active = False
    user.token_version += 1
    add_notification(
        db, user.id, "account_blocked", "Аккаунт заблокирован",
        "Доступ к аккаунту был заблокирован администратором.", "/profile",
    )
    db.commit()
    db.refresh(user)
    return user

@router.post("/admin/accounts/{user_id}/unblock", response_model=AdminUserRead)
def unblock_account(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    add_notification(
        db, user.id, "account_unblocked", "Аккаунт разблокирован",
        "Доступ к аккаунту был восстановлен.", "/profile",
    )
    db.commit()
    db.refresh(user)
    return user

@router.put("/me", response_model=UserRead)
def update_me(
    user_data: UserUpdate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    email_changed = False
    if user_data.email is not None:
        existing = db.query(User).filter(User.email == user_data.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        email_changed = user_data.email != current_user.email
        current_user.email = user_data.email
    if user_data.username is not None:
        existing = db.query(User).filter(User.username == user_data.username, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = user_data.username
    db.commit()
    if email_changed:
        token_data = {"sub": current_user.email, "token_version": current_user.token_version}
        response.set_cookie(
            key="access_token",
            value=create_access_token(token_data),
            httponly=True,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            samesite="lax",
            secure=settings.COOKIE_SECURE,
        )
        response.set_cookie(
            key="refresh_token",
            value=create_refresh_token(token_data),
            httponly=True,
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            samesite="lax",
            secure=settings.COOKIE_SECURE,
        )
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