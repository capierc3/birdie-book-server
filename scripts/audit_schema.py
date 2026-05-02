"""Audit live DB schema vs SQLAlchemy model definitions.

Prints:
  - Tables defined in models but missing from the DB
  - Tables in the DB but not in models (informational)
  - Columns missing from each table (model has it, DB doesn't)
  - The alembic_version state, if any

Run inside the container:
    docker compose exec app python scripts/audit_schema.py
"""
import sys

from sqlalchemy import inspect

import app.models  # noqa: F401 — registers all models with Base.metadata
from app.database import Base, engine


def main() -> int:
    insp = inspect(engine)
    db_tables = set(insp.get_table_names())
    model_tables = set(Base.metadata.tables.keys())

    missing_tables = sorted(model_tables - db_tables)
    extra_tables = sorted(db_tables - model_tables)

    drift: list[tuple[str, list[str]]] = []  # (table, [missing columns])
    for tname in sorted(model_tables & db_tables):
        model_cols = {c.name for c in Base.metadata.tables[tname].columns}
        db_cols = {c["name"] for c in insp.get_columns(tname)}
        missing = sorted(model_cols - db_cols)
        if missing:
            drift.append((tname, missing))

    print("=" * 60)
    print("SCHEMA AUDIT")
    print("=" * 60)

    if missing_tables:
        print("\nTables MISSING from DB (model defines, DB doesn't have):")
        for t in missing_tables:
            print(f"  - {t}")
    else:
        print("\nAll model tables exist in DB. ✓")

    if extra_tables:
        print("\nTables in DB but not in models (informational):")
        for t in extra_tables:
            print(f"  - {t}")

    if drift:
        print("\nColumn DRIFT — DB is missing columns the model defines:")
        for tname, missing in drift:
            print(f"\n  {tname}:")
            for col in missing:
                col_obj = Base.metadata.tables[tname].columns[col]
                col_type = str(col_obj.type)
                nullable = "NULL" if col_obj.nullable else "NOT NULL"
                default = ""
                if col_obj.server_default is not None:
                    default = f" DEFAULT {col_obj.server_default.arg}"
                print(f"    - {col}  {col_type}  {nullable}{default}")
    else:
        print("\nAll existing tables match the model. ✓")

    # Alembic version state
    print("\n" + "-" * 60)
    if "alembic_version" in db_tables:
        with engine.connect() as conn:
            from sqlalchemy import text
            rows = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
            versions = [r[0] for r in rows]
        if versions:
            print(f"Alembic version: {', '.join(versions)}")
        else:
            print("alembic_version table exists but is empty.")
    else:
        print("No alembic_version table — migrations have never been tracked.")

    print("=" * 60)
    return 0 if not (missing_tables or drift) else 1


if __name__ == "__main__":
    sys.exit(main())
