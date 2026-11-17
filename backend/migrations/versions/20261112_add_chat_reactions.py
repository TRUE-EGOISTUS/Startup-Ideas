"""add chat reactions

Revision ID: 20261112react
Revises: 20261112chat
Create Date: 2026-11-12 13:45:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261112react"
down_revision: Union[str, Sequence[str], None] = "20261112chat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "message_reactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ux_message_reactions_message_user_emoji", "message_reactions", ["message_id", "user_id", "emoji"], unique=True)
    op.create_table(
        "project_message_reactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("project_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ux_project_message_reactions_message_user_emoji", "project_message_reactions", ["message_id", "user_id", "emoji"], unique=True)


def downgrade() -> None:
    op.drop_index("ux_project_message_reactions_message_user_emoji", table_name="project_message_reactions")
    op.drop_table("project_message_reactions")
    op.drop_index("ux_message_reactions_message_user_emoji", table_name="message_reactions")
    op.drop_table("message_reactions")
