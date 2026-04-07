from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from pydantic import BaseModel
from app.models import User, UserRole, SpecialistProfile, CompanyProfile
from app.database import SessionLocal, get_db
from app.config import settings
from fastapi.security import OAuth2PasswordBearer

Secret = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated = "auto")
router = APIRouter(prefix="/auth", tags=["auth"])
reusable_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp":expire})
    encoded_jwt = jwt.encode(to_encode, Secret, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(reusable_oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(status_code=401, detail="Invalid token")
    try:
        payload = jwt.decode(token, Secret, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# Pydantic-схемы
class UserRegister(BaseModel):
    email: str
    password: str
    role: UserRole

class UserLogin(BaseModel):
    email: str
    password: str

@router.post("/register")
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = get_password_hash(user_data.password)
    new_user = User(email=user_data.email, hashed_password=hashed, role = user_data.role)
    db.add(new_user)
    db.flush()

    if new_user.role == UserRole.SPECIALIST:
        profile = SpecialistProfile(user_id = new_user.id)
    else:
        profile = CompanyProfile(user_id = new_user.id)
    db.add(profile)

    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "email": new_user.email, "role": new_user.role}

@router.post("/login")
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}