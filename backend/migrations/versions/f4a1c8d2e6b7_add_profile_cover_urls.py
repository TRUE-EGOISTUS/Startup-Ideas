"""add profile cover image urls

Revision ID: f4a1c8d2e6b7
Revises: b7f2c1d8e9a0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4a1c8d2e6b7"
down_revision: Union[str, Sequence[str], None] = "b7f2c1d8e9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("specialist_profiles", sa.Column("cover_url", sa.String(length=500), nullable=True))
    op.add_column("company_profiles", sa.Column("cover_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("company_profiles", "cover_url")
    op.drop_column("specialist_profiles", "cover_url")