from fastapi import FastAPI, Depends
from app.database import engine, Base
from app.auth import router as auth_router, get_current_user
import app.models
from app.tasks import router as tasks_router
from app.users import router as users_router
from fastapi.middleware.cors import CORSMiddleware
from app.chat import router as chat_router, project_router
from app.ideas import router as ideas_router
from fastapi.staticfiles import StaticFiles


app = FastAPI(title="Startup Hybrid API", version="1.0.0")

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # адрес фронта
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(users_router)
app.include_router(chat_router)
app.include_router(project_router)
app.include_router(ideas_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/db-check")
async def db_check(current_user=Depends(get_current_user)):
    from sqlalchemy import text
    from app.database import engine
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        val = result.scalar()
    return {"database": "connected", "select": val}
