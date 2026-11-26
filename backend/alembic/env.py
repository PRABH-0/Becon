import os
import sys
from logging.config import fileConfig
from pathlib import Path

# Add backend directory to sys.path so app can be imported
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.database import Base, normalize_database_url
import app.models  # noqa: F401 - ensure all models are imported and registered with Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    # 1. Explicit connection option or URL from alembic config
    custom_url = config.get_main_option("sqlalchemy.url")
    if custom_url and custom_url != "driver://user:pass@localhost/dbname":
        return normalize_database_url(custom_url)
    # 2. Direct unpooled database URL (critical for Supabase / PgBouncer transaction mode safety)
    direct_url = os.environ.get("DIRECT_URL") or settings.DIRECT_URL
    if direct_url and direct_url.strip():
        return normalize_database_url(direct_url.strip())
    # 3. CI or test database URL
    if "TEST_DATABASE_URL" in os.environ and os.environ["TEST_DATABASE_URL"]:
        return normalize_database_url(os.environ["TEST_DATABASE_URL"])
    # 4. Default app settings database URL
    return normalize_database_url(settings.DATABASE_URL)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = config.attributes.get("connection", None)

    if connectable is None:
        configuration = config.get_section(config.config_ini_section, {})
        configuration["sqlalchemy.url"] = get_url()
        connectable = engine_from_config(
            configuration,
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
