from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

from app.database import Base
from app.config import settings
import app.models  # noqa: F401 — registers all models with Base.metadata

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    # disable_existing_loggers=False is critical when alembic runs at app boot
    # (from app.main._init_schema). The default True would kill uvicorn's
    # already-configured loggers and silence the "Started server process" /
    # "Application startup complete" banner.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
