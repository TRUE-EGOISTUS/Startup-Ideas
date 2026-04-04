from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import os


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@db:5432/startup_db")
engine = create_async_engine(DATABASE_URL, echo = True)

Base = declarative_base()

async def get_db() -> AsyncSession:
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session