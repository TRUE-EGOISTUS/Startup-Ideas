"""merge migration heads

Revision ID: 9acec54c9405
Revises: c2d4e6f8a1b3, c8d4e6f0a1b2
Create Date: 2026-10-01 09:04:39.835214

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9acec54c9405'
down_revision: Union[str, Sequence[str], None] = ('c2d4e6f8a1b3', 'c8d4e6f0a1b2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
