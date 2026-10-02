from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from typing import Optional, List
from uuid import UUID
from app.database import get_db
from app.models import User, Idea, IdeaResponse, Project, ProjectMember, UserRole, ProjectInvite, ProjectMessage
from app.auth import get_current_user, get_optional_user
from app.schemas.idea import (
    IdeaCreate, IdeaUpdate, IdeaResponse as IdeaResponseSchema,
    IdeaResponseCreate, IdeaResponseOut,
    ProjectCreate, ProjectOut, ProjectMemberOut, ProjectInviteOut, ProjectInviteCreate
)

router = APIRouter(prefix="/ideas", tags=["ideas"])

def _refresh_idea_display_ids(db: Session) -> None:
    for display_id, idea in enumerate(db.query(Idea).order_by(Idea.created_at.asc(), Idea.id.asc()).all(), start=1):
        idea.display_id = display_id

def _refresh_project_display_ids(db: Session) -> None:
    for display_id, project in enumerate(db.query(Project).order_by(Project.created_at.asc(), Project.id.asc()).all(), start=1):
        project.display_id = display_id

def _count_responses(idea_id: UUID, db: Session) -> int:
    return db.query(func.count(IdeaResponse.id)).filter(IdeaResponse.idea_id == idea_id).scalar() or 0

def _count_team_members(idea_id: UUID, db: Session) -> int:
    return db.query(func.count(ProjectMember.id)).join(Project, ProjectMember.project_id == Project.id).filter(Project.idea_id == idea_id).scalar() or 0

def _delete_idea_tree(idea: Idea, db: Session) -> None:
    """Remove an idea, its projects, and every dependent collaboration record."""
    project_ids = [project_id for (project_id,) in db.query(Project.id).filter(Project.idea_id == idea.id).all()]
    if project_ids:
        db.query(ProjectMessage).filter(ProjectMessage.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(ProjectInvite).filter(ProjectInvite.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(ProjectMember).filter(ProjectMember.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(Project).filter(Project.id.in_(project_ids)).delete(synchronize_session=False)
    db.query(IdeaResponse).filter(IdeaResponse.idea_id == idea.id).delete(synchronize_session=False)
    db.delete(idea)

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
        author_id=current_user.id,
        roles_needed=idea_data.roles_needed,
        tags=idea_data.tags
    )
    idea.display_id = (db.query(func.max(Idea.display_id)).scalar() or 0) + 1
    db.add(idea)
    db.commit()
    _refresh_idea_display_ids(db)
    db.commit()
    db.refresh(idea)
    return idea

@router.get("/", response_model=List[IdeaResponseSchema])
def list_ideas(
    response: Response,
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = "open",
    tag: Optional[str] = None,
    current_user: Optional[User] = Depends(get_optional_user),
):
    query = db.query(Idea).options(selectinload(Idea.author))
    if status:
        query = query.filter(Idea.status == status)
    if tag:
        query = query.filter(Idea.tags.contains(tag))
    total = query.count()
    ideas = query.offset(skip).limit(limit).all()
    response.headers["X-Total-Count"] = str(total)

    idea_ids = [idea.id for idea in ideas]
    counts = dict(
        db.query(IdeaResponse.idea_id, func.count(IdeaResponse.id))
        .filter(IdeaResponse.idea_id.in_(idea_ids))
        .group_by(IdeaResponse.idea_id)
        .all()
    ) if idea_ids else {}

    result = []
    for idea in ideas:
        item = IdeaResponseSchema.model_validate(idea)
        item.responses_count = counts.get(idea.id, 0)
        item.team_count = _count_team_members(idea.id, db)
        result.append(item)
    return result

@router.get("/my-responses", response_model=List[IdeaResponseOut])
def get_my_idea_response(
    status: Optional[str] = Query(None, description="Фильтр по статусу: pending, accepted, rejected"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(IdeaResponse).filter(IdeaResponse.user_id == current_user.id)
    if status:
        if status not in ["pending", "accepted", "rejected"]:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query = query.filter(IdeaResponse.status == status)
    return query.order_by(IdeaResponse.created_at.desc()).all()

@router.get("/{idea_id}", response_model=IdeaResponseSchema)
def get_idea(
    idea_id: UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    item = IdeaResponseSchema.model_validate(idea)
    item.responses_count = _count_responses(idea_id, db)
    item.team_count = _count_team_members(idea_id, db)
    return item

@router.put("/{idea_id}", response_model=IdeaResponseSchema)
def update_idea(
    idea_id: UUID,
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
    item = IdeaResponseSchema.model_validate(idea)
    item.responses_count = _count_responses(idea_id, db)
    return item

@router.delete("/{idea_id}")
def delete_idea(
    idea_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    _delete_idea_tree(idea, db)
    db.commit()
    _refresh_idea_display_ids(db)
    _refresh_project_display_ids(db)
    db.commit()
    return {"message": "Idea and related projects deleted"}

@router.put("/{idea_id}/status")
def update_idea_status(
    idea_id: UUID,
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
    if status not in ["open", "closed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    if status == "closed":
        _delete_idea_tree(idea, db)
        db.commit()
        _refresh_idea_display_ids(db)
        _refresh_project_display_ids(db)
        db.commit()
        return {"message": "Idea closed and deleted"}

    idea.status = status
    db.commit()
    return {"message": f"Idea status changed to {status}"}

@router.put("/{idea_id}/roles")
def update_idea_roles(
    idea_id: UUID,
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
    idea_id: UUID,
    response_data: IdeaResponseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_membership = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).first()
    if existing_membership:
        raise HTTPException(status_code=400, detail="You are already a member of another project")

    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.status != "open":
        raise HTTPException(status_code=400, detail="Idea is not open for responses")
    if current_user.id == idea.author_id:
        raise HTTPException(status_code=400, detail="You cannot respond to your own idea")
    
    # Проверяем, что выбранная роль есть в списке нужных
    allowed_roles = [r.strip() for r in (idea.roles_needed or "").split(",") if r.strip()]
    submitted_role = response_data.role.strip()
    if not submitted_role:
        raise HTTPException(status_code=400, detail="Role cannot be empty")
    if allowed_roles:
        allowed_lower = [r.lower() for r in allowed_roles]
        if submitted_role.lower() not in allowed_lower:
            raise HTTPException(status_code=400, detail=f"Role '{response_data.role}' is not needed for this idea")
    # Если roles_needed пуст — разрешаем отклик, роль сохраняется как есть
    
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
    idea_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the author can view responses")
    responses = db.query(IdeaResponse).filter(
        IdeaResponse.idea_id == idea_id,
        IdeaResponse.status == "pending"
    ).all()
    return responses

@router.put("/{idea_id}/responses/{response_id}/accept")
def accept_idea_response(
    idea_id: UUID,
    response_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    author_membership = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).first()
    if author_membership:
        raise HTTPException(status_code=400, detail="You are already a member of another project")

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

    responder_membership = db.query(ProjectMember).filter(ProjectMember.user_id == response.user_id).first()
    if responder_membership:
        raise HTTPException(status_code=400, detail="User is already a member of another project")
    
    response.status = "accepted"
    db.commit()
    return {"message": "User accepted; they will join when the idea becomes a project"}

@router.put("/{idea_id}/responses/{response_id}/reject")
def reject_idea_response(
    idea_id: UUID,
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
    
    db.delete(response)
    db.commit()
    return {"message": "Response rejected"}

@router.post("/{idea_id}/convert-to-project", response_model=ProjectOut)
def convert_idea_to_project(
    idea_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    idea = db.query(Idea).filter(Idea.id == idea_id).first()
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if idea.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    if idea.status != "open":
        raise HTTPException(status_code=400, detail="Only open ideas can become projects")

    accepted_responses = db.query(IdeaResponse).filter(
        IdeaResponse.idea_id == idea.id,
        IdeaResponse.status == "accepted"
    ).all()
    accepted_user_ids = [response.user_id for response in accepted_responses]
    if accepted_user_ids and db.query(ProjectMember).filter(ProjectMember.user_id.in_(accepted_user_ids)).first():
        raise HTTPException(status_code=400, detail="One of the accepted users is already in a project")

    project = Project(
        name=idea.title,
        description=idea.short_description,
        roles_needed=idea.roles_needed,
        tags=idea.tags,
        created_by=current_user.id,
        display_id=(db.query(func.max(Project.display_id)).scalar() or 0) + 1,
    )
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=current_user.id, role="author"))
    for response in accepted_responses:
        db.add(ProjectMember(project_id=project.id, user_id=response.user_id, role=response.role))
    db.query(IdeaResponse).filter(IdeaResponse.idea_id == idea.id).delete(synchronize_session=False)
    db.delete(idea)
    db.commit()
    db.refresh(project)
    return project

# ---------- Проекты ----------
@router.get("/projects/my", response_model=List[ProjectOut])
def get_my_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    member_projects = db.query(ProjectMember).filter(
        ProjectMember.user_id == current_user.id
    ).all()
    project_ids = [member_project.project_id for member_project in member_projects]
    if not project_ids:
        return []
    return db.query(Project).filter(Project.id.in_(project_ids)).all()

@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: UUID,
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
    project_id: UUID,
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
    project_id: UUID,
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

    existing_membership = db.query(ProjectMember).filter(ProjectMember.user_id == user_id).first()
    if existing_membership:
        raise HTTPException(status_code=400, detail="User is already a member of another project")
    
    existing_member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    if existing_member:
        raise HTTPException(status_code=400, detail="User already in project")
    existing_invite = db.query(ProjectInvite).filter(
        ProjectInvite.project_id == project_id,
        ProjectInvite.user_id == user_id,
        ProjectInvite.status == "pending"
    ).first()
    if existing_invite:
        raise HTTPException(status_code=400, detail="User already invited")
    
    invite = ProjectInvite(
        project_id=project_id, 
        user_id=user_id, 
        invited_by=current_user.id,
        role=role,
        status="pending"
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {"message": "Invitation sent", "invite_id": invite.id}

@router.post("/projects/{project_id}/invite/{invite_id}/accept")
def accept_project_invite(
    project_id: UUID,
    invite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_membership = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).first()
    if existing_membership:
        raise HTTPException(status_code=400, detail="You are already a member of another project")

    invite = db.query(ProjectInvite).filter(
        ProjectInvite.id == invite_id,
        ProjectInvite.project_id == project_id,
        ProjectInvite.user_id == current_user.id,
        ProjectInvite.status == "pending"
    ).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    existing_member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == current_user.id
    ).first()
    if existing_member:
        raise HTTPException(status_code=400, detail="You are already a member of this project")
    
    member = ProjectMember(
        project_id=project_id, 
        user_id=current_user.id, 
        role=invite.role)
    db.add(member)
    invite.status = "accepted"
    db.commit()
    return {"message": "Invitation accepted and you are now a member of the project"}

@router.post("/projects/{project_id}/invite/{invite_id}/reject")
def reject_project_invite(
    project_id: UUID,
    invite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    invite = db.query(ProjectInvite).filter(
        ProjectInvite.id == invite_id,
        ProjectInvite.project_id == project_id,
        ProjectInvite.user_id == current_user.id,
        ProjectInvite.status == "pending"
    ).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    invite.status = "rejected"
    db.commit()
    return {"message": "Invitation rejected"}

@router.delete("/projects/{project_id}/members/me")
def leave_project(
    project_id: UUID,
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
    project_id: UUID,
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

@router.delete("/{idea_id}/interest")
def withdraw_interest(
    idea_id: UUID,
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