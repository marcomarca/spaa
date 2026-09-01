from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from spaa.config import settings


class Base(DeclarativeBase):
    pass


settings.ensure_directories()
engine = create_engine(
    f"sqlite:///{settings.db_file}",
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    # Ensure models are loaded before creating all tables
    import spaa.adapters.db_models  # noqa: F401

    settings.ensure_directories()
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
