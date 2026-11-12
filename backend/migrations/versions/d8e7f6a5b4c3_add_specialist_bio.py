"""Add a short public bio to specialist profiles."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d8e7f6a5b4c3"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("specialist_profiles", sa.Column("bio", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("specialist_profiles", "bio")
