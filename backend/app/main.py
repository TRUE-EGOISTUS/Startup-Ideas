from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine

app = FastAPI(title="Startup Hybrid API", version="1.0.0")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/db-check")
async def db_check():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        val = result.scalar()
    return {"database": "connected", "select": val}