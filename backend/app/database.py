import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

import logging

logger = logging.getLogger(__name__)

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./evently.db")
IS_CLOUD_RUN = bool(os.getenv("K_SERVICE"))

if IS_CLOUD_RUN:
    if not DATABASE_URL.startswith("postgresql"):
        raise RuntimeError(
            f"Production Cloud Run must use Cloud SQL PostgreSQL database, got: {DATABASE_URL}"
        )
    # Production Cloud Run engine: fail clearly if PostgreSQL connection fails (no silent SQLite fallback)
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=2,
        pool_recycle=300
    )
elif DATABASE_URL.startswith("postgresql"):
    try:
        test_engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        with test_engine.connect() as conn:
            pass
        engine = test_engine
    except Exception as exc:
        logger.warning(
            "Local development: failed to connect to PostgreSQL (%s). Falling back to local SQLite.",
            exc
        )
        DATABASE_URL = "sqlite:///./evently.db"
        engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    connect_args = {}
    if DATABASE_URL.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
