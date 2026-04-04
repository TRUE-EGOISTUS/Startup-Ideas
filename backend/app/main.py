from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine, Base
import app.models

app = FastAPI(title="Startup Hybrid API", version="1.0.0")

@app.on_event("startup")
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/db-check")
async def db_check():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        val = result.scalar()
    return {"database": "connected", "select": val}