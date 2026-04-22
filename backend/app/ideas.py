from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from app.database import get_db
from app.models import User, Idea, IdeaResponse, Project, ProjectMember, UserRole
from app.auth import get_current_user
from app.schemas.idea import (
    IdeaCreate, IdeaUpdate, IdeaResponse as IdeaResponseSchema,
    IdeaResponseCreate, IdeaResponseOut,
    ProjectCreate, ProjectOut, ProjectMemberOut
)

router = APIRouter(prefix="/ideas", tags=["ideas"])

# ---------- Идеи ----------
@router.post("/", response_model=IdeaResponseSchema)
def create_idea(
    idea_data: IdeaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = Idea(
        title=idea_data.title,
        short_description=idea_data.short_description,
        full_description=idea_data.full_description,
        author_id=current_user.id,
        roles_needed=idea_data.roles_needed,
        tags=idea_data.tags
    )
    db.add(idea)
    db.commit()
    db.refresh(idea)
    return idea

@router.get("/", response_model=List[IdeaResponseSchema])
def list_ideas(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = "open",
    tag: Optional[str] = None
):
    query = db.query(Idea)
    if status:
        query = query.filter(Idea.status == status)
    if tag:
        query = query.filter(Idea.tags.contains(tag))
    ideas = query.offset(skip).limit(limit).all()
    return ideas

@router.get("/{idea_id}", response_model=IdeaResponseSchema)
def get_idea(
    idea_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)  # опционально, чтобы показывать полное описание только автору или участникам
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    # Если пользователь не автор, скрываем full_description (опционально)
    if not current_user or current_user.id != idea.author_id:
        idea.full_description = None
    return idea

@router.put("/{idea_id}", response_model=IdeaResponseSchema)
def update_idea(
    idea_id: int,
    idea_data: IdeaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    for field, value in idea_data.model_dump(exclude_unset=True).items():
        setattr(idea, field, value)
    db.commit()
    db.refresh(idea)
    return idea

@router.delete("/{idea_id}")
def delete_idea(
    idea_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    db.delete(idea)
    db.commit()
    return {"message": "Idea deleted"}

# ---------- Отклики на идеи ----------
@router.post("/{idea_id}/interest", response_model=IdeaResponseOut)
def respond_to_idea(
    idea_id: int,
    response_data: IdeaResponseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.status != "open":
        raise HTTPException(status_code=400, detail="Idea is closed for responses")
    # Проверка, не откликался ли уже
    existing = db.query(IdeaResponse).filter(
        IdeaResponse.idea_id == idea_id,
        IdeaResponse.user_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already responded")
    response = IdeaResponse(
        idea_id=idea_id,
        user_id=current_user.id,
        message=response_data.message
    )
    db.add(response)
    db.commit()
    db.refresh(response)
    return response

@router.get("/{idea_id}/responses", response_model=List[IdeaResponseOut])
def get_idea_responses(
    idea_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the author can view responses")
    responses = db.query(IdeaResponse).filter(IdeaResponse.idea_id == idea_id).all()
    return responses

@router.put("/{idea_id}/responses/{response_id}/accept")
def accept_idea_response(
    idea_id: int,
    response_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    response = db.query(IdeaResponse).filter(
        IdeaResponse.id == response_id,
        IdeaResponse.idea_id == idea_id,
        IdeaResponse.status == "pending"
    ).first()
    if not response:
        raise HTTPException(status_code=404, detail="Response not found or already processed")
    response.status = "accepted"
    # Создаём проект, если его ещё нет
    project = db.query(Project).filter(Project.idea_id == idea_id).first()
    if not project:
        project = Project(
            name=idea.title,
            description=idea.short_description,
            idea_id=idea.id,
            created_by=current_user.id
        )
        db.add(project)
        db.flush()
        # Добавляем автора как участника
        member = ProjectMember(project_id=project.id, user_id=current_user.id, role="author")
        db.add(member)
    # Добавляем принятого пользователя в проект
    existing_member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project.id,
        ProjectMember.user_id == response.user_id
    ).first()
    if not existing_member:
        member = ProjectMember(project_id=project.id, user_id=response.user_id, role="member")
        db.add(member)
    db.commit()
    return {"message": "User accepted and added to project", "project_id": project.id}

# ---------- Проекты ----------
@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Проверка, что пользователь – участник
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this project")
    return project

@router.get("/projects/{project_id}/members", response_model=List[ProjectMemberOut])
def get_project_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member")
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    return members

# Эндпоинт для приглашения (добавления участника) – только для создателя проекта
@router.post("/projects/{project_id}/invite/{user_id}")
def invite_to_project(
    project_id: int,
    user_id: int,
    role: Optional[str] = "member",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project creator can invite")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already in project")
    member = ProjectMember(project_id=project_id, user_id=user_id, role=role)
    db.add(member)
    db.commit()
    return {"message": "User invited successfully"}