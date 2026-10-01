"""Use UUIDs for task identity and add contiguous display numbers."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c8d4e6f0a1b2"
down_revision: Union[str, Sequence[str], None] = "f4a1c8d2e6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.add_column("tasks", sa.Column("display_id", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("id_uuid", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE tasks SET id_uuid = gen_random_uuid()")

    for table in ("task_responses", "task_executions", "messages"):
        op.add_column(table, sa.Column("task_id_uuid", postgresql.UUID(as_uuid=True), nullable=True))
        op.execute(
            sa.text(
                f"UPDATE {table} child SET task_id_uuid = parent.id_uuid "
                "FROM tasks parent WHERE child.task_id = parent.id"
            )
        )
        op.drop_constraint(f"{table}_task_id_fkey", table, type_="foreignkey")
        op.drop_column(table, "task_id")
        op.alter_column(table, "task_id_uuid", new_column_name="task_id", nullable=False)

    op.drop_constraint("tasks_pkey", "tasks", type_="primary")
    op.drop_index("ix_tasks_id", table_name="tasks")
    op.drop_column("tasks", "id")
    op.alter_column("tasks", "id_uuid", new_column_name="id", nullable=False)
    op.create_primary_key("tasks_pkey", "tasks", ["id"])
    op.create_index("ix_tasks_id", "tasks", ["id"])

    op.execute(
        "UPDATE tasks SET display_id = ordered.display_id "
        "FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS display_id FROM tasks) ordered "
        "WHERE tasks.id = ordered.id"
    )
    op.alter_column("tasks", "display_id", nullable=False)
    op.create_unique_constraint("uq_tasks_display_id", "tasks", ["display_id"])

    for table in ("task_responses", "task_executions", "messages"):
        op.create_foreign_key(f"{table}_task_id_fkey", table, "tasks", ["task_id"], ["id"])


def downgrade() -> None:
    raise NotImplementedError("Downgrading UUID task identifiers would lose task identity")