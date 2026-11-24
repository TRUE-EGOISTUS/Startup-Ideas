from fastapi import APIRouter, Depends, HTTPException, Response, Request, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from passlib.context import CryptContext
from jose import JWTError, jwt, ExpiredSignatureError
from datetime import datetime, timedelta, timezone
from typing import Optional
from email.message import EmailMessage
import smtplib


from app.schemas.user import UserCreate, UserRead
from app.models import User, UserRole, VerificationStatus, SpecialistProfile, CompanyProfile
from app.database import get_db
from app.config import settings


Secret = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
router = APIRouter(prefix="/auth", tags=["auth"])


def verify_password(plain_password, hashed_password):
    # bcrypt accepts at most 72 UTF-8 bytes; reject longer input safely.
    if len(plain_password.encode("utf-8")) > 72:
        return False
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=422, detail="Password must not exceed 72 UTF-8 bytes")
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    to_encode["type"] = "access"
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp":expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM) 

def create_refresh_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    to_encode["type"] = "refresh"
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp":expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def create_email_verification_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    return jwt.encode(
        {"sub": email, "type": "email_verification", "exp": expire},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

def send_verification_email(email: str, token: str) -> None:
    if not all((settings.SMTP_HOST, settings.SMTP_FROM_EMAIL)):
        raise RuntimeError("Email verification is not configured")

    message = EmailMessage()
    message["Subject"] = "Подтверждение электронной почты"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = email
    message.set_content(
        f"Подтвердите электронную почту по ссылке:\n"
        f"{settings.FRONTEND_URL}/verify-email?token={token}\n\n"
        "Ссылка действительна 24 часа."
    )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(message)

def send_moderator_invitation_email(email: str, token: str) -> None:
    if not all((settings.SMTP_HOST, settings.SMTP_FROM_EMAIL)):
        raise RuntimeError("Email delivery is not configured")

    message = EmailMessage()
    message["Subject"] = "Приглашение в команду модерации"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = email
    message.set_content(
        f"Примите приглашение по ссылке:\n"
        f"{settings.FRONTEND_URL}/accept-moderator-invitation?token={token}\n\n"
        "Ссылка действительна 2 дня."
    )
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(message)

def get_current_user_from_token(token: str, db: Session) -> User:
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if email is None or payload.get("type") != "access":
            raise credentials_exception
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")
    if payload.get("token_version", 0) != user.token_version:
        raise credentials_exception
    return user

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
     # Пытаемся получить access_token из cookies
    token = request.cookies.get("access_token")
    if not token:
        # Если нет в cookies, пробуем взять из заголовка Authorization (для совместимости со Swagger)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        else:
            raise HTTPException(status_code=401, detail="Not authenticated")
    return get_current_user_from_token(token, db)

def get_optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        else:
            return None
    try:
        return get_current_user_from_token(token, db)
    except HTTPException:
        return None
# Pydantic-схема

@router.post("/register", response_model=UserRead)
def register(
    user_data: UserCreate, 
    db: Session = Depends(get_db)
    ):
    
    normalized_email = user_data.email.strip().lower()
    existing_email = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    existing_username = db.query(User).filter(User.username == user_data.username).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    hashed = get_password_hash(user_data.password)
    new_user = User(
        email=normalized_email,
        username=user_data.username,
        hashed_password=hashed,
        role=user_data.role,
        verification_status=(
            VerificationStatus.PENDING.value
            if user_data.role == UserRole.COMPANY
            else VerificationStatus.VERIFIED.value
        ),
    )
    db.add(new_user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="User already exists")

    if new_user.role == UserRole.SPECIALIST:
        profile = SpecialistProfile(user_id=new_user.id)
    else:
        profile = CompanyProfile(user_id=new_user.id)
    db.add(profile)
    
    try:
        verification_token = create_email_verification_token(new_user.email)
        send_verification_email(new_user.email, verification_token)
        db.commit()
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc))
    except (OSError, smtplib.SMTPException):
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not send verification email")
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Сould not complete registration, please try again")
    
    db.refresh(new_user)
    return new_user

@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if email is None or payload.get("type") != "email_verification":
            raise HTTPException(status_code=400, detail="Invalid verification token")
    except ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Verification link expired")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_verified:
        return {"message": "Email already verified"}

    user.is_verified = True
    db.commit()
    return {"message": "Email verified successfully"}

@router.post("/login")
def login(
    response: Response,
    username: str = Form(...),   # Теперь это может быть email или username
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    # Пытаемся найти пользователя по email или username
    login_value = username.strip()
    user = db.query(User).filter(
        (func.lower(User.email) == login_value.lower()) | (User.username == login_value)
    ).first()

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before logging in")
    
    token_data = {"sub": user.email, "token_version": user.token_version}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )
    return {"message": "Logged in successfully"}

@router.post("/refresh")
def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if email is None or payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active or not user.is_verified:
        raise HTTPException(status_code=401, detail="User not found, inactive, or email not verified")

    if payload.get("token_version", 0) != user.token_version:
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    new_access_token = create_access_token(data={"sub": user.email, "token_version": user.token_version})
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )
    return {"message": "Access token refreshed"}

@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    # Revoke a signed token even when its access-token expiry has elapsed.
    # This makes logout work when the access token has expired but the cookie
    # is still present, and it also invalidates the corresponding refresh token.
    for cookie_name, expected_type in (
        ("access_token", "access"),
        ("refresh_token", "refresh"),
    ):
        token = request.cookies.get(cookie_name)
        if not token:
            continue
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": False},
            )
        except JWTError:
            continue

        if payload.get("type") != expected_type:
            continue
        email = payload.get("sub")
        if not email:
            continue
        user = db.query(User).filter(User.email == email).first()
        if user and payload.get("token_version", 0) == user.token_version:
            user.token_version += 1
            db.commit()
            break

    response.delete_cookie(
        "access_token", path="/", httponly=True,
        samesite="lax", secure=settings.COOKIE_SECURE,
    )
    response.delete_cookie(
        "refresh_token", path="/", httponly=True,
        samesite="lax", secure=settings.COOKIE_SECURE,
    )
    return {"message": "Logged out"}