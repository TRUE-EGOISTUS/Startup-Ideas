from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Float
from datetime import datetime, timezone
from sqlalchemy import Enum as SQLEnum
import enum
from sqlalchemy.orm import relationship
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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))   # исправлено
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.SPECIALIST)
    username = Column(String(100), unique=True, nullable=False)

    # связи
    specialist_profile = relationship("SpecialistProfile", back_populates="user", uselist=False)
    company_profile = relationship("CompanyProfile", back_populates="user", uselist=False)
    task_responses = relationship("TaskResponseModel", back_populates="user")
    task_executions = relationship("TaskExecution", back_populates="user")
    messages = relationship("Message", back_populates="user")
    idea_responses = relationship("IdeaResponse", back_populates="user")
    projects = relationship("ProjectMember", back_populates="user")
    

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(20), default="open", index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    reward = Column(Integer, nullable=True)
    deadline = Column(DateTime, nullable=True)   # общий дедлайн для open-задач
    visibility = Column(String(20), default="public")
    execution_mode = Column(String(20), default="classic", index=True)
    required_skills = Column(Text, nullable=True)
    difficulty = Column(String(20), nullable=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # поля дедлайна для classic-задач
    executor_deadline_minutes = Column(Integer, nullable=True) # срок в минутах
    current_executor_deadline = Column(DateTime, nullable=True) # конкретная дата дедлайна текущего исполнителя

    responses = relationship("TaskResponseModel", back_populates="task")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    executions = relationship("TaskExecution", back_populates="task")
    messages = relationship("Message", back_populates="task")

class SpecialistProfile(Base):
    __tablename__ = "specialist_profiles"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    skills = Column(Text)
    github_url = Column(String(200))
    portfolio = Column(Text)
    rating = Column(Float, default=0.0)
    avatar_url = Column(String(500), nullable=True)

    user = relationship("User", back_populates="specialist_profile")

class CompanyProfile(Base):
    __tablename__ = "company_profiles"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    company_name = Column(String(200))
    logo_url = Column(String(200))
    description = Column(Text)
    contact_info = Column(String(200))
    
    user = relationship("User", back_populates="company_profile")

class TaskResponseModel(Base):
    __tablename__ = "task_responses"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))   # исправлено

    task = relationship("Task", back_populates="responses")
    user = relationship("User", back_populates="task_responses")

class TaskExecution(Base):
    __tablename__ = "task_executions"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    solution_url = Column(String(500), nullable=True)
    comment = Column(Text, nullable=True)
    feedback = Column(Text, nullable=True)
    rating = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status = Column(String(20), default="pending")
    
    task = relationship("Task", back_populates="executions")
    user = relationship("User", back_populates="task_executions")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    task = relationship("Task", back_populates="messages")
    user = relationship("User", back_populates="messages")

class Idea(Base):
    __tablename__ = "ideas"
    
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    short_description = Column(Text, nullable=False)
    full_description = Column(Text, nullable=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    roles_needed = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)
    created_at = Column(DateTime, default= lambda: datetime.now(timezone.utc))
    status = Column(String(20), default="open", index=True)

    author = relationship("User", foreign_keys=[author_id])
    responses = relationship("IdeaResponse", back_populates="idea")
    projects = relationship("Project", back_populates="idea")

class IdeaResponse(Base):
    __tablename__ = "idea_responses"

    id = Column(Integer, primary_key=True)
    idea_id = Column(Integer, ForeignKey("ideas.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=True)
    role = Column(String(100), nullable=False) # роль, на которую претендует откликнувшийся (например, "frontend developer", "designer", "project manager")
    status = Column(String(20), default="pending", index=True)  # pending, accepted, rejected
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    idea = relationship("Idea", back_populates="responses")
    user = relationship("User", back_populates="idea_responses")

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False )
    description = Column(Text, nullable=True)
    idea_id = Column(Integer, ForeignKey("ideas.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    idea = relationship("Idea", back_populates="projects")
    creator = relationship("User", foreign_keys=[created_by])
    members = relationship("ProjectMember", back_populates="project")

class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(100), nullable=True)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="projects")