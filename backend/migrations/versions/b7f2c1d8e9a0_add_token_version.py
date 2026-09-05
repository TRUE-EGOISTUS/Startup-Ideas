"""add token version for session invalidation

Revision ID: b7f2c1d8e9a0
Revises: 7035c6986a3c
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b7f2c1d8e9a0"
down_revision: Union[str, Sequence[str], None] = ("7035c6986a3c", "0c4e911006d8")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
