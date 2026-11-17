"""Run database migrations to latest head programmatically."""
from pathlib import Path
from alembic.config import Config
from alembic import command

backend_dir = Path(__file__).resolve().parent


def run_migrations() -> None:
    ini_path = backend_dir / "alembic.ini"
    config = Config(str(ini_path))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    command.upgrade(config, "head")
    print("Database migrated to head successfully.")


if __name__ == "__main__":
    run_migrations()
