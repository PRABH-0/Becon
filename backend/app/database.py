import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

# Read from environment or fallback
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Default fallback to local SQL Server if not provided in .env
    DATABASE_URL = "mssql+pyodbc://sa:sa123@localhost/becon_db?driver=ODBC+Driver+17+for+SQL+Server"

# SQLAlchemy psycopg2 driver formatting for Postgres
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

engine = create_engine(DATABASE_URL, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
