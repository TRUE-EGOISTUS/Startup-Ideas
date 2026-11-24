"""Add idempotency keys to chat messages

Revision ID: 20261124chatids
Revises: 20261112channels
Create Date: 2026-11-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261124chatids"
down_revision: Union[str, Sequence[str], None] = "20261112channels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("client_id", sa.String(length=64), nullable=True))
    op.add_column("project_messages", sa.Column("client_id", sa.String(length=64), nullable=True))
    op.create_index(
        "ux_messages_task_user_client_id",
        "messages",
        ["task_id", "user_id", "client_id"],
        unique=True,
    )
    op.create_index(
        "ux_project_messages_project_user_client_id",
        "project_messages",
        ["project_id", "user_id", "client_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ux_project_messages_project_user_client_id", table_name="project_messages")
    op.drop_index("ux_messages_task_user_client_id", table_name="messages")
    op.drop_column("project_messages", "client_id")
    op.drop_column("messages", "client_id")
