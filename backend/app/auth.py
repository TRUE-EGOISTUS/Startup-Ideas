from fastapi import APIRouter, Depends, HTTPException, Response, Request, Form
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from passlib.context import CryptContext
from jose import JWTError, jwt, ExpiredSignatureError
from datetime import datetime, timedelta, timezone


from app.schemas.user import UserCreate, UserRead
from app.models import User, UserRole, SpecialistProfile, CompanyProfile
from app.database import get_db
from app.config import settings


Secret = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
router = APIRouter(prefix="/auth", tags=["auth"])


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp":expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM) 

def create_refresh_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp":expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def get_current_user_from_token(token: str, db: Session) -> User:
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")
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
# Pydantic-схема

@router.post("/register", response_model=UserRead)
def register(
    user_data: UserCreate, 
    db: Session = Depends(get_db)
    ):
    
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    existing_username = db.query(User).filter(User.username == user_data.username).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    hashed = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed,
        role=user_data.role
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
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Сould not complete registration, please try again")
    
    db.refresh(new_user)
    return new_user

@router.post("/login")
def login(
    response: Response,
    username: str = Form(...),   # Теперь это может быть email или username
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    # Пытаемся найти пользователя по email или username
    user = db.query(User).filter(
        (User.email == username) | (User.username == username)
    ).first()

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")
    
    access_token = create_access_token(data={"sub": user.email})
    refresh_token = create_refresh_token(data={"sub": user.email})

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=False,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        samesite="lax",
        secure=False,
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
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    new_access_token = create_access_token(data={"sub": user.email})
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=False,
    )
    return {"message": "Access token refreshed"}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}