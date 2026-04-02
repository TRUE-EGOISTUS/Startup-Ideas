from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.sql import func
from app.database import Base
import enum

class UserRole (str, enum.Enum):
    specialist = "specialist"
    company = "company"
    admin = "admin"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key= True, index=True)
    email = Column(String(320), unique=True, index=True, nullable=False)
    hashed_password = Column(String(1024), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.specialist, nullable=False)