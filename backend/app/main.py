from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
import os
from app.database import engine, Base
from app.auth import router as auth_router, get_current_user
import app.models
from app.tasks import router as tasks_router
from app.users import router as users_router
from fastapi.middleware.cors import CORSMiddleware
from app.chat import router as chat_router, project_router, attachments_router
from app.ideas import router as ideas_router
from app.notifications import router as notifications_router
from app.config import settings


app = FastAPI(title="Startup Hybrid API", version="1.0.0")

# Profile images remain public. Chat attachments are served by an authenticated
# endpoint in chat.py, so knowing their URL is not enough to download them.
PROFILE_UPLOAD_DIR = os.path.abspath(os.path.join("static", "uploads"))


@app.get("/static/uploads/{filename}", include_in_schema=False)
def get_profile_upload(filename: str):
    safe_filename = os.path.basename(filename)
    if safe_filename != filename or os.path.splitext(safe_filename)[1].lower() not in {".jpg", ".jpeg", ".png"}:
        raise HTTPException(status_code=404, detail="File not found")

    filepath = os.path.abspath(os.path.join(PROFILE_UPLOAD_DIR, safe_filename))
    if os.path.commonpath([filepath, PROFILE_UPLOAD_DIR]) != PROFILE_UPLOAD_DIR or not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    media_type = "image/png" if filepath.lower().endswith(".png") else "image/jpeg"
    return FileResponse(
        filepath,
        media_type=media_type,
        headers={"X-Content-Type-Options": "nosniff"},
    )

allowed_origins = {
    origin.strip().rstrip("/")
    for origin in settings.CORS_ORIGINS.split(",")
    if origin.strip()
}
if settings.FRONTEND_URL.strip():
    allowed_origins.add(settings.FRONTEND_URL.strip().rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(users_router)
app.include_router(chat_router)
app.include_router(project_router)
app.include_router(attachments_router)
app.include_router(ideas_router)
app.include_router(notifications_router)

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
