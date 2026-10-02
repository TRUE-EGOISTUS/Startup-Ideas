"""Normalize legacy idea in-progress statuses."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE ideas SET status = 'open' WHERE status = 'in_progress'"))


def downgrade() -> None:
    pass
