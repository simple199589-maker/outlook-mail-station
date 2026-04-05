"""Database utilities for Outlook Mail Station."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import inspect
from sqlmodel import Session, SQLModel, create_engine

from .settings import DATABASE_URL


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def _ensure_sqlite_parent_dir() -> None:
    """AI by zb: 在 SQLite 文件模式下提前创建数据库父目录。"""
    if not DATABASE_URL.startswith("sqlite:///"):
        return
    raw_path = DATABASE_URL.removeprefix("sqlite:///")
    if not raw_path or raw_path == ":memory:":
        return
    db_path = Path(raw_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)


def _ensure_outlook_account_columns() -> None:
    """AI by zb: 为旧数据库补齐账号相关字段。"""
    inspector = inspect(engine)
    if "outlook_accounts" not in inspector.get_table_names():
        return

    columns = {item["name"] for item in inspector.get_columns("outlook_accounts")}
    statements: list[str] = []
    if "is_pinned" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT 0")
    if "pinned_at" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN pinned_at TIMESTAMP")
    if "batch_code" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN batch_code VARCHAR NOT NULL DEFAULT ''")
    if "lease_expires_at" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN lease_expires_at TIMESTAMP")
    if "last_leased_at" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN last_leased_at TIMESTAMP")
    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.exec_driver_sql(statement)


def init_db() -> None:
    """AI by zb: 初始化新站点使用的全部数据库表。"""
    _ensure_sqlite_parent_dir()
    SQLModel.metadata.create_all(engine)
    _ensure_outlook_account_columns()


@contextmanager
def session_scope() -> Iterator[Session]:
    """AI by zb: 提供带自动关闭能力的数据库会话上下文。"""
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """AI by zb: 提供 FastAPI 依赖注入使用的数据库会话。"""
    with Session(engine) as session:
        yield session
