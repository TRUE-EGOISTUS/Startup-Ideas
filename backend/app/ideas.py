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
    current_user: Optional[User] = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    # Если пользователь не автор, скрываем full_description
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
    # Проверяем, нет ли уже проекта по этой идее
    existing_project = db.query(Project).filter(Project.idea_id == idea_id).first()
    if existing_project:
        raise HTTPException(status_code=400, detail="Cannot delete idea because a project already exists")
    db.delete(idea)
    db.commit()
    return {"message": "Idea deleted"}

@router.put("/{idea_id}/status")
def update_idea_status(
    idea_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Изменить статус идеи.
    Допустимые статусы: 'open', 'in_progress', 'closed'
    """
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    if status not in ["open", "in_progress", "closed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    idea.status = status
    db.commit()
    return {"message": f"Idea status changed to {status}"}

@router.put("/{idea_id}/roles")
def update_idea_roles(
    idea_id: int,
    roles_needed: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Обновить список требуемых ролей для идеи.
    Принимает строку с ролями через запятую.
    """
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    idea.roles_needed = roles_needed
    db.commit()
    return {"message": "Roles updated", "roles_needed": roles_needed}

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
        raise HTTPException(status_code=400, detail="Idea is not open for responses")
    if current_user.id == idea.author_id:
        raise HTTPException(status_code=400, detail="You cannot respond to your own idea")
    
    # Проверяем, что выбранная роль есть в списке нужных
    if not idea.roles_needed:
        raise HTTPException(status_code=400, detail="No roles specified for this idea")
    allowed_roles = [r.strip() for r in idea.roles_needed.split(",") if r.strip()]
    if response_data.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Role '{response_data.role}' is not needed for this idea")
    
    existing = db.query(IdeaResponse).filter(
        IdeaResponse.idea_id == idea_id,
        IdeaResponse.user_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You have already responded to this idea")
    
    response = IdeaResponse(
        idea_id=idea_id,
        user_id=current_user.id,
        role=response_data.role,
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
    
    # Проверяем, нет ли уже принятого участника на эту роль в проекте
    project = db.query(Project).filter(Project.idea_id == idea_id).first()
    if project:
        existing_member_with_role = db.query(ProjectMember).filter(
            ProjectMember.project_id == project.id,
            ProjectMember.role == response.role
        ).first()
        if existing_member_with_role:
            raise HTTPException(status_code=400, detail=f"Role '{response.role}' is already filled in the project")
    else:
        # Создаём проект
        project = Project(
            name=idea.title,
            description=idea.short_description,
            idea_id=idea.id,
            created_by=current_user.id
        )
        db.add(project)
        db.flush()
        # Добавляем автора идеи как участника с ролью "author"
        author_member = ProjectMember(project_id=project.id, user_id=current_user.id, role="author")
        db.add(author_member)
    
    # Добавляем пользователя в проект
    existing_member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project.id,
        ProjectMember.user_id == response.user_id
    ).first()
    if not existing_member:
        member = ProjectMember(project_id=project.id, user_id=response.user_id, role=response.role)
        db.add(member)
        db.flush()
    
    response.status = "accepted"
    
    # Проверяем, все ли роли заполнены (опционально)
    if idea.roles_needed:
        needed_roles = set(r.strip() for r in idea.roles_needed.split(",") if r.strip())
        filled_roles = set(m.role for m in project.members if m.role in needed_roles)
        if needed_roles.issubset(filled_roles):
            idea.status = "in_progress"
    
    db.commit()
    return {"message": "User accepted and added to project", "project_id": project.id}

@router.put("/{idea_id}/responses/{response_id}/reject")
def reject_idea_response(
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
    
    response.status = "rejected"
    db.commit()
    return {"message": "Response rejected"}

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

@router.delete("/projects/{project_id}/members/me")
def leave_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.created_by == current_user.id:
        raise HTTPException(status_code=400, detail="Project creator cannot leave. Transfer ownership or delete project.")
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this project")
    db.delete(member)
    db.commit()
    return {"message": "You left the project"}

@router.delete("/projects/{project_id}/members/{user_id}")
def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project creator can remove members")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Creator cannot be removed. Use delete project instead.")
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="User is not a member")
    db.delete(member)
    db.commit()
    return {"message": "Member removed"}

# В конец файла добавить:

@router.get("/projects/my", response_model=List[ProjectOut])
def get_my_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    member_projects = db.query(ProjectMember).filter(
        ProjectMember.user_id == current_user.id
    ).all()
    project_ids = [mp.project_id for mp in member_projects]
    projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
    return projects

@router.delete("/{idea_id}/interest")
def withdraw_interest(
    idea_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    response = db.query(IdeaResponse).filter(
        IdeaResponse.idea_id == idea_id,
        IdeaResponse.user_id == current_user.id,
        IdeaResponse.status == "pending"
    ).first()
    if not response:
        raise HTTPException(status_code=404, detail="No pending response found")
    db.delete(response)
    db.commit()
    return {"message": "Response withdrawn"}