from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine, Base
from app.auth import router as auth_router
import app.models
from app.tasks import router as tasks_router
from app.users import router as users_router

app = FastAPI(title="Startup Hybrid API", version="1.0.0")

Base.metadata.create_all(bind = engine)
app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(users_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/db-check")
async def db_check():
    from sqlalchemy import text
    from app.database import engine
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        val = result.scalar()
    return {"database": "connected", "select": val}
