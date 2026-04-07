from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Float
from sqlalchemy import Enum as SQLEnum
import enum
from sqlalchemy.sql import func
from app.database import Base

class UserRole(str, enum.Enum):
    SPECIALIST = "specialist"
    COMPANY = "company"
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(1024), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.SPECIALIST)
class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(20), default="open")  # open, in_progress, completed
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reward = Column(Integer, nullable=True)
    deadline = Column(DateTime(timezone=True), nullable=True)
    visibility = Column(String(20), default="public")
    execution_mode = Column(String(20), default="classic")
    required_skills = Column(Text, nullable=True)
    difficulty = Column(String(20), nullable=True)
class SpecialistProfile(Base):
    __tablename__ = "specialist_profiles"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    skills = Column(Text)  # можно хранить JSON-список
    github_url = Column(String(200))
    portfolio = Column(Text)
    rating = Column(Float, default=0.0)
class CompanyProfile(Base):
    __tablename__ = "company_profiles"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    company_name = Column(String(200))
    logo_url = Column(String(200))
    description = Column(Text)
    contact_info = Column(String(200))

class TaskResponse(Base):
    __tablename__ = "task_responses"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TaskExecution(Base):
    __tablename__ = "task_executions"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    solution_url = Column(String(500))
    feedback = Column(Text)
    rating = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
