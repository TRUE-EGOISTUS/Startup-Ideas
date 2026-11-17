"""add project chat channels

Revision ID: 20261112channels
Revises: 20261112react
Create Date: 2026-11-12 14:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261112channels"
down_revision: Union[str, Sequence[str], None] = "20261112react"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_messages", sa.Column("channel", sa.String(length=40), nullable=False, server_default="general"))
    op.create_index("ix_project_messages_channel", "project_messages", ["channel"])
    op.alter_column("project_messages", "channel", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_project_messages_channel", table_name="project_messages")
    op.drop_column("project_messages", "channel")
