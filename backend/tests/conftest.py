import os
import sys
import tempfile
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from alembic import command

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import get_db
from app.main import app as fastapi_app

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session", autouse=True)
def setup_test_db_and_app():
    """Session-level fixture configuring an isolated migrated test database."""
    temp_file = None
    if "TEST_DATABASE_URL" in os.environ and os.environ["TEST_DATABASE_URL"]:
        db_url = os.environ["TEST_DATABASE_URL"]
    else:
        temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        db_url = f"sqlite:///{temp_file.name}"
        temp_file.close()

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")

    engine = create_engine(db_url)
    if db_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    import app.database as app_db

    orig_engine = app_db.engine
    orig_session = app_db.SessionLocal
    app_db.engine = engine
    app_db.SessionLocal = TestingSessionLocal

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db

    yield

    fastapi_app.dependency_overrides.pop(get_db, None)
    app_db.engine = orig_engine
    app_db.SessionLocal = orig_session
    engine.dispose()
    if temp_file and os.path.exists(temp_file.name):
        try:
            os.remove(temp_file.name)
        except Exception:
            pass
