"""add chat attachments

Revision ID: 20261112attach
Revises: 20261112channels
Create Date: 2026-11-12 14:15:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261112attach"
down_revision: Union[str, Sequence[str], None] = "20261112channels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("attachment_url", sa.String(length=500), nullable=True))
    op.add_column("messages", sa.Column("attachment_name", sa.String(length=255), nullable=True))
    op.add_column("project_messages", sa.Column("attachment_url", sa.String(length=500), nullable=True))
    op.add_column("project_messages", sa.Column("attachment_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("project_messages", "attachment_name")
    op.drop_column("project_messages", "attachment_url")
    op.drop_column("messages", "attachment_name")
    op.drop_column("messages", "attachment_url")
