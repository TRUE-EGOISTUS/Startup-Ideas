"""add moderator invitations

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-11-10 14:40:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column("users", sa.Column("can_moderate_companies", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("users", "can_moderate_companies", server_default=None)
    op.create_table(
        "moderator_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=100), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
    )
    op.create_index("ix_moderator_invitations_email", "moderator_invitations", ["email"])

def downgrade() -> None:
    op.drop_index("ix_moderator_invitations_email", table_name="moderator_invitations")
    op.drop_table("moderator_invitations")
    op.drop_column("users", "can_moderate_companies")
