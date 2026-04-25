from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from typing import Optional
from sqlalchemy import or_
from app.database import get_db
from app.models import (
    User, Task,
    UserRole, TaskResponseModel,
    TaskExecution )
from app.auth import get_current_user
from app.schemas.task import (
     TaskCreate, TaskResponseSchema, 
     TaskResponseCreate, TaskResponseOut, 
     TaskCompleteRequest, TaskReviewRequest, OpenSolutionRequest, TaskExecutionOut)

router = APIRouter(prefix="/tasks", tags=["tasks"])

from datetime import datetime, timezone, timedelta

def _handle_executor_deadline(task: Task, db: Session) -> bool:
    """
    Проверяет и обновляет дедлайн для исполнителя в классической задаче.
    Возвращает True, если дедлайн истёк и задача переведена в ready_for_next, иначе False.
    """
    if (task.execution_mode == "classic" and 
        task.status == "in_progress" and
        task.current_executor_deadline is not None and 
        datetime.utcnow() > task.current_executor_deadline):

        # Создаём запись о провале
        execution = TaskExecution( 
            task_id=task.id,
            user_id=task.assigned_to_id,
            solution_url=None,
            comment="Дедлайн истёк, исполнитель не предоставил решение",
            status="submitted",
            rating=1,  # минимальная оценка за провал
            feedback="Исполнитель не уложился в дедлайн"
        )
        db.add(execution)
        
        # Обновляем рейтинг исполнителя
        specialist = db.query(User).filter(User.id == task.assigned_to_id).first()
        if specialist and specialist.role == UserRole.SPECIALIST:
            all_ratings = db.query(TaskExecution.rating).filter(
                TaskExecution.user_id == specialist.id,
                TaskExecution.rating.isnot(None)
            ).all()
            ratings = [r[0] for r in all_ratings] + [1]  # добавляем единицу
            avg_rating = sum(ratings) / len(ratings)
            specialist.specialist_profile.rating = avg_rating

        # Сбрасываем задачу
        task.status = "ready_for_next"
        task.assigned_to_id = None
        task.current_executor_deadline = None

        db.commit()
        return True
    return False
     
@router.post("/", response_model=TaskResponseSchema)
def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.COMPANY:
        raise HTTPException(status_code=403, detail="Only companies can create tasks")
    
    deadline_utc = None
    if task_data.deadline:
        # Если deadline пришёл без часового пояса, считаем его московским
        if task_data.deadline.tzinfo is None:
            # Добавляем московский пояс
            msk_tz = timezone(timedelta(hours=3))
            msk_dt = task_data.deadline.replace(tzinfo=msk_tz)
            # Переводим в UTC
            deadline_utc = msk_dt.astimezone(timezone.utc).replace(tzinfo=None)
        else:
            deadline_utc = task_data.deadline.astimezone(timezone.utc).replace(tzinfo=None)
    
    task = Task(
    title=task_data.title,
    description=task_data.description,
    author_id=current_user.id,
    reward=task_data.reward,
    deadline=deadline_utc,
    visibility=task_data.visibility,
    execution_mode=task_data.execution_mode,
    required_skills=task_data.required_skills,
    difficulty=task_data.difficulty,
    executor_deadline_minutes=task_data.executor_deadline_minutes if task_data.execution_mode == "classic" else None
)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@router.get("/")
def get_tasks(
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    difficulty: Optional[str] = None,
    min_reward: Optional[int] = None,
    max_reward: Optional[int] = None,
    search: Optional[str] = None,
    skill: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
):
    query = db.query(Task)
    if status:
        query = query.filter(Task.status == status)
    if difficulty:
        query = query.filter(Task.difficulty == difficulty)
    if min_reward is not None:
        query = query.filter(Task.reward >= min_reward)
    if max_reward is not None:
        query = query.filter(Task.reward <= max_reward)
    if search:
        query = query.filter(
            or_(
                Task.title.ilike(f"%{search}%"),
                Task.description.ilike(f"%{search}%")
            )
        )
    if skill:
        query = query.filter(Task.required_skills.contains(skill))
    tasks = query.options(selectinload(Task.author), selectinload(Task.responses)).offset(skip).limit(limit).all()
    return tasks

@router.post("/{task_id}/responses", response_model=TaskResponseOut)
def create_response(
    task_id: int,
    response_data: TaskResponseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.SPECIALIST:
        raise HTTPException(status_code=403, detail="Only specialists can respond")
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Даём разрешение на отклики для классических задач в статусах open и ready_for_next
    # Для открытых задачи только open
    allowed_statuses = ["open"]
    if task.execution_mode == "classic":
        allowed_statuses.append("ready_for_next")
    if task.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Task is not open for responses")
    
    existing = db.query(TaskResponseModel).filter(
        TaskResponseModel.task_id == task_id,
        TaskResponseModel.user_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already responded")
    
    response = TaskResponseModel(
        task_id=task_id,
        user_id=current_user.id,
        message=response_data.message
    )
    db.add(response)
    db.commit()
    db.refresh(response)
    return response

@router.put("/{task_id}/responses/{response_id}/accept")
def accept_response(
    task_id: int,
    response_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.author_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not owned by you")
    
    # Этот эндпоинт только для классических задач, так как в открытых исполнители не назначаются, а решения просто принимаются
    if task.execution_mode != "classic":
        raise HTTPException(status_code=400, detail="This endpoint is only for classic execution mode tasks")
   
    # Сначала обрабатываем возможную просрочку текущего исполнителя (если есть)
    _handle_executor_deadline(task, db)
    db.refresh(task)  # Обновляем состояние задачи после возможного изменения статуса
    
    # Разрешаем принятие исполнителя только если задача в статусе open (для обоих режимов) или ready_for_next (для классического)
    # и нет назначенного исполнителя
    if task.status not in ["open", "ready_for_next"] or task.assigned_to_id is not None:
        raise HTTPException(status_code=400, detail="Task already has an executor or is not open")
    
    response = db.query(TaskResponseModel).filter(
        TaskResponseModel.id == response_id,
        TaskResponseModel.task_id == task_id,
        TaskResponseModel.status == "pending"
    ).first()
    if not response:
        raise HTTPException(status_code=404, detail="Response not found or already processed")
    
    # Переводим все остальные отклики в статус queued, чтобы они не мешались (не отклоняем)
    db.query(TaskResponseModel).filter(
        TaskResponseModel.task_id == task_id,
        TaskResponseModel.id != response_id,
        TaskResponseModel.status == "pending"
    ).update({"status": "queued"})
    
    response.status = "accepted"
    task.assigned_to_id = response.user_id
    task.status = "in_progress"
    
    # Устанавливаем персональный дедлайн для исполнителя, если это классическая задача
    if task.execution_mode == "classic" and task.executor_deadline_minutes:
        task.current_executor_deadline = datetime.utcnow() + timedelta(minutes=task.executor_deadline_minutes)
    
    db.commit()
    return {"message": "Executor selected, task in progress"}

@router.post("/{task_id}/complete")
def complete_task(
    task_id: int,
    complete_data: TaskCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Только исполнитель задачи может завершить
    task = db.query(Task).filter(Task.id == task_id, Task.assigned_to_id == current_user.id).first()
    if not task:
       raise HTTPException(status_code=404, detail="Task not found or you are not the executor")
    
    # Проверяем просрочку
    if _handle_executor_deadline(task, db):
        raise HTTPException(status_code=400, detail="Deadline expired, task is now open for new responses")
    
    if task.status != "in_progress":
        raise HTTPException(status_code=400, detail="Task is not in progress")
    
    # Создаём запись выполнения
    execution = TaskExecution(
        task_id=task.id,
        user_id=current_user.id,
        solution_url=complete_data.solution_url,
        comment=complete_data.comment 
    )
    db.add(execution)
    execution.status = "submitted"
    task.status = "awaiting_review"
    db.commit()
    db.refresh(execution)
    return {"message": "Task completed successfully", "execution_id": execution.id}

@router.post("/{task_id}/review")
def review_task(
    task_id: int,
    review_data: TaskReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.author_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not owned by you")
    
    # На всякий случай проверяем просрочку (если задача зависла в in_progress))
    _handle_executor_deadline(task, db)
    db.refresh(task)

    if task.status != "awaiting_review":
        raise HTTPException(status_code=400, detail="Task is not awaiting review")
    if review_data.rating < 1 or review_data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Находим выполнение задачи (последнее)
    execution = db.query(TaskExecution).filter(TaskExecution.task_id == task.id).order_by(TaskExecution.created_at.desc()).first()
    if not execution:
        raise HTTPException(status_code=404, detail="No execution found for this task")
    
    execution.rating = review_data.rating
    execution.feedback = review_data.feedback
    
    # В классическом режиме после оценки задача готова принять следующего исполнителя
    task.status = "ready_for_next"
    task.assigned_to_id = None # Снимаем исполнителя, чтобы задача снова стала доступной для откликов
    task.current_executor_deadline = None # Сбрасываем персональный дедлайн
    
    # Обновляем рейтинг исполнителя (среднее арифметическое)
    specialist = execution.user
    if specialist.role == UserRole.SPECIALIST:
       # Получаем все оценки по всем выполненным задачам специалиста
        all_ratings = db.query(TaskExecution.rating).filter(TaskExecution.user_id == specialist.id, TaskExecution.rating.isnot(None)).all()
        ratings = [r[0] for r in all_ratings]
        if ratings:
            avg_rating = sum(ratings) / len(ratings)
            specialist.specialist_profile.rating = avg_rating
        else:
            specialist.specialist_profile.rating = review_data.rating
    db.commit()

    return {"message": "Review submitted", "rating": review_data.rating} 

@router.delete("/{task_id}/execution")
def cancel_execution(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Только исполнитель задачи может отменить выполнение
    task = db.query(Task).filter(
        Task.id == task_id, 
        Task.assigned_to_id == current_user.id
        ).first()
   
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or you are not the executor")
    
    if task.execution_mode != "classic":
        raise HTTPException(status_code=400, detail="Only classic execution mode tasks can be cancelled by executor")

    if task.status != "in_progress":
        raise HTTPException(status_code=400, detail="Task is not in progress")
    
    # Проверяем, не истёк ли дедлайн (если истёк, то задача уже открыта для новых откликов, просто сообщаем об этом)
    if _handle_executor_deadline(task, db):
        db.refresh(task)
        raise HTTPException(
            status_code=400, 
            detail="Deadline expired, task has been automatically reset"
        )
    # Если дедлайн не истёк, создаём запись об отказе
    execution = TaskExecution(
        task_id=task.id,
        user_id=current_user.id,
        solution_url=None,
        comment="Исполнитель отказался от выполнения задачи",
        status="submitted",
        rating=None,
        feedback="Отказ от выполнения"
    )
    db.add(execution)

    task.assigned_to_id = None
    task.current_executor_deadline = None
    task.status = "ready_for_next"

    db.commit()
    return {"message": "You have been removed from the task, it is now open for new responses"}

@router.post("/{task_id}/open-solution", response_model=TaskExecutionOut)
def submit_open_solution(
    task_id: int,
    solution_data: OpenSolutionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    
    if current_user.role != UserRole.SPECIALIST:
        raise HTTPException(status_code=403, detail="Only specialists can submit solutions")
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task: 
        raise HTTPException(status_code=404, detail="Task not found")
    if task.execution_mode != "open":
        raise HTTPException(status_code=400, detail="Task is not in open execution mode")
    
    # Проверка дедлайна для открытых задач
    now_utc = datetime.utcnow()
    if task.deadline and now_utc > task.deadline:
        # Если дедлайн прошёл, переводим задачу в reviewing и запрещаем новые решения
        if task.status == "open":
            task.status = "reviewing"
            db.commit()
        raise HTTPException(status_code=400, detail="Deadline has passed, submissions are closed")
    
    if task.status != "open":
        raise HTTPException(status_code=400, detail="Task is not open for submissions")
    
    existing = db.query(TaskExecution).filter(
        TaskExecution.task_id == task_id,
        TaskExecution.user_id == current_user.id,
        TaskExecution.status.in_(["pending", "accepted"])
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You have already submitted a solution")
    
    execution = TaskExecution(
        task_id=task_id,
        user_id=current_user.id,
        solution_url=solution_data.solution_url,
        comment=solution_data.comment,
        status="pending"
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    return execution

@router.get("/{task_id}/solutions", response_model=list[TaskExecutionOut])
def get_task_solutions(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.id != task.author_id:
        raise HTTPException(status_code=403, detail="Only the task author can view solutions")
    
    solutions = db.query(TaskExecution).filter(TaskExecution.task_id == task_id).order_by(TaskExecution.created_at).all()
    return solutions

@router.put("/{task_id}/solutions/{execution_id}/accept")
def accept_solution(
    task_id: int,
    execution_id: int,
    rating: int,
    feedback: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.author_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not owned by you")
    if task.execution_mode != "open":
        raise HTTPException(status_code=400, detail="Task is not in open execution mode")
    if task.status not in ("open", "reviewing"):
        raise HTTPException(status_code=400, detail="Task is not open for accepting solutions")

    # Если дедлайн прошёл, а задача ещё open, переводим её в reviewing
    now_utc = datetime.utcnow()
    if task.deadline and now_utc > task.deadline and task.status == "open":
        task.status = "reviewing"
        

    execution = db.query(TaskExecution).filter(
        TaskExecution.id == execution_id,
        TaskExecution.task_id == task_id,
        TaskExecution.status == "pending"
    ).first()

    if not execution:
        raise HTTPException(status_code=404, detail="Solution not found or already processed")
    
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    execution.status = "accepted"
    execution.rating = rating
    execution.feedback = feedback
    
    # Не отклоняем остальные решения автоматически
    # Проверяем, остались ли ещё pending решения
    pending_count = db.query(TaskExecution).filter(
        TaskExecution.task_id == task_id,
        TaskExecution.status == "pending"
    ).count()
    # Если решений нет, закрываем задачу
    if pending_count == 0:
        task.status = "closed"

    # Обновляем рейтинг исполнителя (среднее арифметическое)   
    specialist = execution.user
    if specialist.role == UserRole.SPECIALIST:
        all_ratings = db.query(TaskExecution.rating).filter(
            TaskExecution.user_id == specialist.id,
            TaskExecution.rating.isnot(None)
        ).all()
        ratings = [r[0] for r in all_ratings]
        if ratings:
            avg_rating = sum(ratings) / len(ratings)
            specialist.specialist_profile.rating = avg_rating
        else:
            specialist.specialist_profile.rating = rating

    db.commit()
    return {"message": "Solution accepted and rated"}

@router.put("/{task_id}/solutions/{execution_id}/reject")
def reject_solution(
    task_id: int,
    execution_id: int,
    feedback: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.author_id == current_user.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not owned by you")
    if task.execution_mode != "open":
        raise HTTPException(status_code=400, detail="This endpoint is only for open tasks")
    if task.status not in ("open", "reviewing"):
        raise HTTPException(status_code=400, detail="Task is not accepting solutions")

    execution = db.query(TaskExecution).filter(
        TaskExecution.id == execution_id,
        TaskExecution.task_id == task_id,
        TaskExecution.status == "pending"
    ).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Solution not found or already processed")

    execution.status = "rejected"
    execution.feedback = feedback or "Решение отклонено автором задачи"

    # Проверяем, остались ли ещё pending решения
    pending_count = db.query(TaskExecution).filter(
        TaskExecution.task_id == task_id,
        TaskExecution.status == "pending"
    ).count()
    if pending_count == 0:
        task.status = "closed"

    db.commit()
    return {"message": "Solution rejected", "task_status": task.status}

@router.post("/{task_id}/solutions/reject-all")
def reject_all_solutions(
    task_id: int,
    close_task: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.author_id == current_user.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not owned by you")
    if task.execution_mode != "open":
        raise HTTPException(status_code=400, detail="This endpoint is only for open tasks")
    if task.status not in ("open", "reviewing"):
        raise HTTPException(status_code=400, detail="Task is not accepting solutions")

    pending_solutions = db.query(TaskExecution).filter(
        TaskExecution.task_id == task_id,
        TaskExecution.status == "pending"
    ).all()

    if not pending_solutions:
        raise HTTPException(status_code=404, detail="No pending solutions to reject")

    for solution in pending_solutions:
        solution.status = "rejected"
        solution.feedback = "Решение отклонено автором задачи"

    if close_task:
        task.status = "closed"

    db.commit()
    return {
        "message": f"Rejected {len(pending_solutions)} solution(s)",
        "task_status": task.status
    }

@router.put("/{task_id}/close")
def close_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.author_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not owned by you")
    if task.status == "closed":
        raise HTTPException(status_code=400, detail="Task is already closed")
    
    if task.execution_mode == "classic":
        # Отклоняем все ожидающие и поставленные в очередь отклики
        db.query(TaskResponseModel).filter(
            TaskResponseModel.task_id == task_id,
            TaskResponseModel.status.in_(["pending", "queued"])
        ).update({"status": "rejected"}, synchronize_session=False)
    elif task.execution_mode == "open":
        # Отклоняем все непроверенные решения
        db.query(TaskExecution).filter(
            TaskExecution.task_id == task_id, 
            TaskExecution.status == "pending"
        ).update({"status": "rejected"}, synchronize_session=False)
    
    task.status = "closed"
    db.commit()
    return {"message": "Task closed for further participation"}