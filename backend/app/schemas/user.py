from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum

class UserRole(str,Enum):
    SPECIALIST = "specialist"
    COMPANY = "company"

# Базовые схемы

class UserBase(BaseModel):
    email: EmailStr
    role: UserRole

class UserCreate(UserBase):
    password: str

class UserUpdate(UserBase):
    email: Optional[EmailStr] = None

class UserRead(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True # для совместимости с ORM

class SpecialistProfileRead(BaseModel):
    id: int
    user_id: int
    skills: Optional[str]
    rating: float
    github_url: Optional[str]
    portfolio: Optional[str]

    class Config:
        from_attributes = True

class CompanyProfileRead(BaseModel):
    id: int
    user_id: int
    company_name: Optional[str]
    description: Optional[str]
    logo_url: Optional[str]
    contact_info: Optional[str]

    class Config:
        from_attributes = True

# для обновления профилей (потом можно расширить)
class SpecialistProfileUpdate(BaseModel):
    skills: Optional[str] = None
    github_url: Optional[str] = None
    portfolio: Optional[str] = None

class CompanyProfileUpdate(BaseModel):
    company_name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    contact_info: Optional[str] = None