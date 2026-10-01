"""Use UUIDs for idea and project identity with display numbers."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d7e9f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "9acec54c9405"
branch_labels = None
depends_on = None


def _convert_foreign_key(
    table: str,
    old_column: str,
    new_column: str,
    source_table: str,
    nullable: bool,
) -> None:
    op.add_column(table, sa.Column(new_column, postgresql.UUID(as_uuid=True), nullable=True))
    op.execute(
        sa.text(
            f"UPDATE {table} child SET {new_column} = parent.id_uuid "
            f"FROM {source_table} parent WHERE child.{old_column} = parent.id"
        )
    )
    op.drop_constraint(f"{table}_{old_column}_fkey", table, type_="foreignkey")
    op.drop_column(table, old_column)
    op.alter_column(table, new_column, new_column_name=old_column, nullable=nullable)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.add_column("ideas", sa.Column("display_id", sa.Integer(), nullable=True))
    op.add_column("ideas", sa.Column("id_uuid", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE ideas SET id_uuid = gen_random_uuid()")

    op.add_column("projects", sa.Column("display_id", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column("id_uuid", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE projects SET id_uuid = gen_random_uuid()")

    _convert_foreign_key("idea_responses", "idea_id", "idea_id_uuid", "ideas", False)
    _convert_foreign_key("projects", "idea_id", "idea_id_uuid", "ideas", True)
    _convert_foreign_key("project_members", "project_id", "project_id_uuid", "projects", False)
    _convert_foreign_key("project_invites", "project_id", "project_id_uuid", "projects", False)
    _convert_foreign_key("project_messages", "project_id", "project_id_uuid", "projects", False)

    op.drop_constraint("ideas_pkey", "ideas", type_="primary")
    op.drop_column("ideas", "id")
    op.alter_column("ideas", "id_uuid", new_column_name="id", nullable=False)
    op.create_primary_key("ideas_pkey", "ideas", ["id"])
    op.create_index("ix_ideas_id", "ideas", ["id"])

    op.drop_constraint("projects_pkey", "projects", type_="primary")
    op.drop_column("projects", "id")
    op.alter_column("projects", "id_uuid", new_column_name="id", nullable=False)
    op.create_primary_key("projects_pkey", "projects", ["id"])
    op.create_index("ix_projects_id", "projects", ["id"])

    op.execute(
        "UPDATE ideas SET display_id = ordered.display_id "
        "FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS display_id FROM ideas) ordered "
        "WHERE ideas.id = ordered.id"
    )
    op.execute(
        "UPDATE projects SET display_id = ordered.display_id "
        "FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS display_id FROM projects) ordered "
        "WHERE projects.id = ordered.id"
    )
    op.alter_column("ideas", "display_id", nullable=False)
    op.alter_column("projects", "display_id", nullable=False)
    op.create_unique_constraint("uq_ideas_display_id", "ideas", ["display_id"])
    op.create_unique_constraint("uq_projects_display_id", "projects", ["display_id"])

    op.create_foreign_key("idea_responses_idea_id_fkey", "idea_responses", "ideas", ["idea_id"], ["id"])
    op.create_foreign_key("projects_idea_id_fkey", "projects", "ideas", ["idea_id"], ["id"])
    op.create_foreign_key("project_members_project_id_fkey", "project_members", "projects", ["project_id"], ["id"])
    op.create_foreign_key("project_invites_project_id_fkey", "project_invites", "projects", ["project_id"], ["id"])
    op.create_foreign_key("project_messages_project_id_fkey", "project_messages", "projects", ["project_id"], ["id"])


def downgrade() -> None:
    raise NotImplementedError("Downgrading UUID idea and project identifiers would lose identity")
