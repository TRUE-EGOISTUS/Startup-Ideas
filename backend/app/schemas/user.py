from pydantic import BaseModel, EmailStr, computed_field
from typing import Optional
from datetime import datetime, timedelta
from enum import Enum

class UserRole(str, Enum):
    SPECIALIST = "specialist"
    COMPANY = "company"

class VerificationStatus(str, Enum):
    VERIFIED = "verified"
    PENDING = "pending"
    REJECTED = "rejected"

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
    is_superuser: bool
    created_at: datetime
    updated_at: Optional[datetime]
    username: Optional[str]
    verification_status: VerificationStatus
    verification_rejection_reason: Optional[str] = None
    can_moderate_companies: bool

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
    bio: Optional[str]
    rating: float
    github_url: Optional[str]
    portfolio: Optional[str]
    avatar_url: Optional[str]
    cover_url: Optional[str]

    class Config:
        from_attributes = True

class CompanyProfileRead(BaseModel):
    id: int
    user_id: int
    company_name: Optional[str]
    description: Optional[str]
    logo_url: Optional[str]
    cover_url: Optional[str]
    contact_info: Optional[str]

    class Config:
        from_attributes = True

# для обновления профилей (потом можно расширить)
class SpecialistProfileUpdate(BaseModel):
    skills: Optional[str] = None
    bio: Optional[str] = None
    github_url: Optional[str] = None
    portfolio: Optional[str] = None
    cover_url: Optional[str] = None

class CompanyProfileUpdate(BaseModel):
    company_name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    cover_url: Optional[str] = None
    contact_info: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class PublicUserRead(BaseModel):
    id: int
    role: UserRole
    created_at: datetime
    updated_at: Optional[datetime]
    username: Optional[str]
    is_active: bool
    verification_status: Optional[VerificationStatus] = None
    specialist_profile: Optional[SpecialistProfileRead] = None
    company_profile: Optional[CompanyProfileRead] = None

    class Config:
        from_attributes = True

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


class SpecialistHomeRead(BaseModel):
    id: int
    username: Optional[str]
    skills: list[str]
    avatar_url: Optional[str]
    weekly_activity: int
    weekly_rating: Optional[float]


    class Config:
        from_attributes = True

class AdminCompanyRead(UserRead):
    verification_rejection_reason: Optional[str] = None
    company_profile: Optional[CompanyProfileRead] = None

class AdminUserRead(UserRead):
    verification_rejection_reason: Optional[str] = None