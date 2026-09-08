"""remove unused idea full description

Revision ID: c2d4e6f8a1b3
Revises: f4a1c8d2e6b7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d4e6f8a1b3"
down_revision: Union[str, Sequence[str], None] = "f4a1c8d2e6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("ideas", "full_description")


def downgrade() -> None:
    op.add_column("ideas", sa.Column("full_description", sa.Text(), nullable=True))