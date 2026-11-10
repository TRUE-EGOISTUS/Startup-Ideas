"""add separate specialist and company roles

Revision ID: c1d2e3f4a5b6
Revises: b0e4ce430c0d
Create Date: 2026-11-06 15:48:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b0e4ce430c0d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ideas", sa.Column("roles_specialists", sa.Text(), nullable=True))
    op.add_column("ideas", sa.Column("roles_companies", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("roles_specialists", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("roles_companies", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "roles_companies")
    op.drop_column("projects", "roles_specialists")
    op.drop_column("ideas", "roles_companies")
    op.drop_column("ideas", "roles_specialists")
