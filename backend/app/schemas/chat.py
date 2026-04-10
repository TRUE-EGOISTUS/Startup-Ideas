from pydantic import BaseModel, computed_field
from datetime import datetime, timedelta
from typing import Optional

class MessageCreate(BaseModel):
    text: str

class MessageOut(BaseModel):
    id: int
    task_id: int
    user_id: int
    text: str
    created_at: datetime

    @computed_field
    @property
    def created_at_msk(self) -> str:
        msk = self.created_at + timedelta(hours=3)
        return msk.isoformat(timespec='milliseconds')

    class Config:
        from_attributes = True