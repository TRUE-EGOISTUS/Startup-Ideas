"""Store transferred idea fields on projects."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d7e9f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("roles_needed", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("tags", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "tags")
    op.drop_column("projects", "roles_needed")