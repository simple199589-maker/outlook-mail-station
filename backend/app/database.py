"""Database utilities for Outlook Mail Station."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import inspect
from sqlmodel import Session, SQLModel, create_engine, select

from .models import OutlookAccount, Site, StationUser, USER_ROLE_ADMIN, USER_ROLE_USER, generate_station_api_key, utcnow
from .settings import ADMIN_PASSWORD, DATABASE_URL


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
DEFAULT_POOL_USER_USERNAME = "default"
DEFAULT_POOL_USER_PASSWORD = "default"
DEFAULT_SITES = [
    ("GPT", "GPT"),
    ("KIRO", "Kiro"),
]


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
    if "owner_user_id" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN owner_user_id INTEGER")
    if "inbox_last_uid" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN inbox_last_uid INTEGER")
    if "junk_last_uid" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN junk_last_uid INTEGER")
    if "sent_last_uid" not in columns:
        statements.append("ALTER TABLE outlook_accounts ADD COLUMN sent_last_uid INTEGER")
    with engine.begin() as connection:
        for statement in statements:
            connection.exec_driver_sql(statement)
        connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_outlook_accounts_inbox_last_uid ON outlook_accounts(inbox_last_uid)")
        connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_outlook_accounts_junk_last_uid ON outlook_accounts(junk_last_uid)")
        connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_outlook_accounts_sent_last_uid ON outlook_accounts(sent_last_uid)")


def _ensure_station_user_columns() -> None:
    """AI by zb: 为旧数据库补齐后台用户的 API Key 字段。"""
    inspector = inspect(engine)
    if "station_users" not in inspector.get_table_names():
        return

    columns = {item["name"] for item in inspector.get_columns("station_users")}
    with engine.begin() as connection:
        if "api_key" not in columns:
            connection.exec_driver_sql("ALTER TABLE station_users ADD COLUMN api_key VARCHAR")
        if "last_imported_at" not in columns:
            connection.exec_driver_sql("ALTER TABLE station_users ADD COLUMN last_imported_at TIMESTAMP")
        connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS uq_station_users_api_key ON station_users(api_key)")


def generate_unique_user_api_key(session: Session) -> str:
    """AI by zb: 生成数据库内唯一的用户级 API Key。"""
    while True:
        candidate = generate_station_api_key()
        pending_keys = {
            item.api_key
            for item in [*session.identity_map.values(), *session.new]
            if isinstance(item, StationUser) and item.api_key
        }
        if candidate in pending_keys:
            continue
        existing = session.exec(select(StationUser).where(StationUser.api_key == candidate)).first()
        if not existing:
            return candidate


def _ensure_default_admin_user() -> None:
    """AI by zb: 根据环境变量预置默认管理员账号。"""
    password = str(ADMIN_PASSWORD or "").strip()
    if not password:
        return
    with Session(engine) as session:
        existing = session.exec(select(StationUser).where(StationUser.username == "admin")).first()
        if existing:
            changed = False
            if existing.password != password:
                existing.password = password
                changed = True
            if existing.role != USER_ROLE_ADMIN:
                existing.role = USER_ROLE_ADMIN
                changed = True
            if existing.api_key:
                existing.api_key = None
                changed = True
            if not existing.enabled:
                existing.enabled = True
                changed = True
            if changed:
                existing.updated_at = utcnow()
                session.add(existing)
                session.commit()
            return
        session.add(
            StationUser(
                username="admin",
                password=password,
                role=USER_ROLE_ADMIN,
                api_key=None,
                enabled=True,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
        session.commit()


def _ensure_default_pool_user() -> None:
    """AI by zb: 为历史未归属邮箱准备默认普通用户。"""
    with Session(engine) as session:
        existing = session.exec(select(StationUser).where(StationUser.username == DEFAULT_POOL_USER_USERNAME)).first()
        if existing:
            changed = False
            if existing.role != USER_ROLE_USER:
                existing.role = USER_ROLE_USER
                changed = True
            if existing.password != DEFAULT_POOL_USER_PASSWORD:
                existing.password = DEFAULT_POOL_USER_PASSWORD
                changed = True
            if not existing.api_key:
                existing.api_key = generate_unique_user_api_key(session)
                changed = True
            if not existing.enabled:
                existing.enabled = True
                changed = True
            if changed:
                existing.updated_at = utcnow()
                session.add(existing)
                session.commit()
            return
        session.add(
            StationUser(
                username=DEFAULT_POOL_USER_USERNAME,
                password=DEFAULT_POOL_USER_PASSWORD,
                role=USER_ROLE_USER,
                api_key=generate_unique_user_api_key(session),
                enabled=True,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
        session.commit()


def _ensure_user_api_keys() -> None:
    """AI by zb: 为历史普通用户补齐独立 API Key。"""
    with Session(engine) as session:
        users = session.exec(select(StationUser)).all()
        changed = False
        for user in users:
            if user.role == USER_ROLE_ADMIN:
                if user.api_key:
                    user.api_key = None
                    user.updated_at = utcnow()
                    session.add(user)
                    changed = True
                continue
            if user.api_key:
                continue
            user.api_key = generate_unique_user_api_key(session)
            user.updated_at = utcnow()
            session.add(user)
            changed = True
        if changed:
            session.commit()


def _assign_legacy_accounts_to_default_user() -> None:
    """AI by zb: 将历史未归属邮箱迁移到默认普通用户池。"""
    with Session(engine) as session:
        default_user = session.exec(select(StationUser).where(StationUser.username == DEFAULT_POOL_USER_USERNAME)).first()
        if not default_user or default_user.id is None:
            return
        legacy_accounts = session.exec(select(OutlookAccount).where(OutlookAccount.owner_user_id.is_(None))).all()
        if not legacy_accounts:
            return
        now = utcnow()
        for account in legacy_accounts:
            account.owner_user_id = default_user.id
            account.updated_at = now
            session.add(account)
        session.commit()


def _ensure_default_sites() -> None:
    """AI by zb: 为新站点化账号池预置默认站点。"""
    with Session(engine) as session:
        existing_sites = {
            str(site.code or "").strip().upper(): site
            for site in session.exec(select(Site)).all()
            if site.code
        }
        changed = False
        for code, name in DEFAULT_SITES:
            current = existing_sites.get(code)
            if current:
                if current.name != name:
                    current.name = name
                    current.updated_at = utcnow()
                    session.add(current)
                    changed = True
                continue
            session.add(
                Site(
                    code=code,
                    name=name,
                    enabled=True,
                    created_at=utcnow(),
                    updated_at=utcnow(),
                )
            )
            changed = True
        if changed:
            session.commit()


def init_db() -> None:
    """AI by zb: 初始化新站点使用的全部数据库表。"""
    _ensure_sqlite_parent_dir()
    SQLModel.metadata.create_all(engine)
    _ensure_outlook_account_columns()
    _ensure_station_user_columns()
    _ensure_default_admin_user()
    _ensure_default_pool_user()
    _ensure_user_api_keys()
    _assign_legacy_accounts_to_default_user()
    _ensure_default_sites()


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
