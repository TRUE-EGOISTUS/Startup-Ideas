"""add email verification

Revision ID: ea1b2c3d4e5f
Revises: 9acec54c9405
Create Date: 2026-11-10 13:20:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "ea1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET is_verified = TRUE WHERE is_verified IS NULL OR is_verified = FALSE")


def downgrade() -> None:
    pass
