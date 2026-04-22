from pydantic import BaseModel, EmailStr, computed_field
from typing import Optional
from datetime import datetime, timedelta
from enum import Enum

class UserRole(str, Enum):
    SPECIALIST = "specialist"
    COMPANY = "company"

class UserBase(BaseModel):
    email: EmailStr
    role: UserRole

class UserCreate(UserBase):
    password: str
    username: str 

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None

class UserRead(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]
    username: Optional[str]

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    @computed_field
    @property
    def updated_at_msk(self) -> Optional[str]:
        if self.updated_at:
            msk = self.updated_at + timedelta(hours=3)
            return msk.isoformat(timespec='milliseconds')
        return None

    class Config:
        from_attributes = True# для совместимости с ORM

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

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str