"""add user verification status

Revision ID: f1a2b3c4d5e6
Revises: ea1b2c3d4e5f
Create Date: 2026-11-10 13:55:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "ea1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "verification_status",
            sa.String(length=20),
            nullable=False,
            server_default="verified",
        ),
    )
    op.alter_column("users", "verification_status", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "verification_status")
