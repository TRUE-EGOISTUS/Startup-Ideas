"""add chat message metadata

Revision ID: 20261112chat
Revises: d8e7f6a5b4c3
Create Date: 2026-11-12 13:30:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261112chat"
down_revision: Union[str, Sequence[str], None] = "d8e7f6a5b4c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("reply_to_id", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("system_type", sa.String(length=40), nullable=True))
    op.add_column("messages", sa.Column("read_at", sa.DateTime(), nullable=True))
    op.create_index("ix_messages_reply_to_id", "messages", ["reply_to_id"])
    op.create_foreign_key(
        "fk_messages_reply_to_id_messages",
        "messages",
        "messages",
        ["reply_to_id"],
        ["id"],
    )

    op.add_column("project_messages", sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("project_messages", sa.Column("reply_to_id", sa.Integer(), nullable=True))
    op.add_column("project_messages", sa.Column("system_type", sa.String(length=40), nullable=True))
    op.add_column("project_messages", sa.Column("read_at", sa.DateTime(), nullable=True))
    op.create_index("ix_project_messages_reply_to_id", "project_messages", ["reply_to_id"])
    op.create_foreign_key(
        "fk_project_messages_reply_to_id_project_messages",
        "project_messages",
        "project_messages",
        ["reply_to_id"],
        ["id"],
    )
    op.alter_column("project_messages", "is_pinned", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_project_messages_reply_to_id_project_messages", "project_messages", type_="foreignkey")
    op.drop_index("ix_project_messages_reply_to_id", table_name="project_messages")
    op.drop_column("project_messages", "read_at")
    op.drop_column("project_messages", "system_type")
    op.drop_column("project_messages", "reply_to_id")
    op.drop_column("project_messages", "is_pinned")

    op.drop_constraint("fk_messages_reply_to_id_messages", "messages", type_="foreignkey")
    op.drop_index("ix_messages_reply_to_id", table_name="messages")
    op.drop_column("messages", "read_at")
    op.drop_column("messages", "system_type")
    op.drop_column("messages", "reply_to_id")
