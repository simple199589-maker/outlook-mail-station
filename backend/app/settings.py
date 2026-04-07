"""Application settings for Outlook Mail Station."""

from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
STATIC_DIR = BACKEND_DIR / "static"
API_PREFIX = "/api"
APP_NAME = "Outlook Mail Station"
ENV_FILE = ROOT_DIR / ".env"


def _read_env_file() -> dict[str, str]:
    """AI by zb: 读取项目根目录 `.env` 文件中的键值。"""
    if not ENV_FILE.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in ENV_FILE.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


_FILE_ENV = _read_env_file()


def get_setting(name: str, default: str = "") -> str:
    """AI by zb: 优先读取系统环境变量，其次读取项目 `.env`。"""
    runtime = str(os.getenv(name, "") or "").strip()
    if runtime:
        return runtime
    return str(_FILE_ENV.get(name, default) or default).strip()


def _normalize_database_url(url: str) -> str:
    """AI by zb: 兼容本机与 Docker 的 SQLite 路径配置。"""
    raw = str(url or "").strip()
    if not raw.startswith("sqlite:////app/"):
        return raw

    # Docker 内直接使用容器路径，本机开发时映射到项目目录。
    if Path("/.dockerenv").exists():
        return raw

    relative = raw.removeprefix("sqlite:////app/").replace("\\", "/")
    local_path = ROOT_DIR / relative
    return f"sqlite:///{local_path.as_posix()}"


DATABASE_URL = _normalize_database_url(get_setting(
    "OUTLOOK_MAIL_STATION_DB",
    f"sqlite:///{(ROOT_DIR / 'outlook_mail_station.db').as_posix()}",
))
DEFAULT_SYNC_LIMIT = int(get_setting("OUTLOOK_MAIL_STATION_SYNC_LIMIT", "30") or "30")
DEFAULT_SHARE_DAYS = int(get_setting("OUTLOOK_MAIL_STATION_SHARE_DAYS", "30") or "30")
AUTO_REFRESH_SECONDS = int(get_setting("OUTLOOK_MAIL_STATION_AUTO_REFRESH", "10") or "10")
OPEN_API_SYNC_COOLDOWN_SECONDS = int(get_setting("OUTLOOK_MAIL_STATION_OPEN_API_SYNC_COOLDOWN_SECONDS", "60") or "60")
ACTIVE_MAILBOX_SYNC_INTERVAL_SECONDS = int(get_setting("OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_INTERVAL_SECONDS", "5") or "5")
ACTIVE_MAILBOX_SYNC_STALE_SECONDS = int(get_setting("OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_STALE_SECONDS", "8") or "8")
ACTIVE_MAILBOX_SYNC_LIMIT = int(get_setting("OUTLOOK_MAIL_STATION_ACTIVE_MAILBOX_SYNC_LIMIT", str(DEFAULT_SYNC_LIMIT)) or str(DEFAULT_SYNC_LIMIT))
ADMIN_PASSWORD = get_setting("OUTLOOK_MAIL_STATION_ADMIN_PASSWORD", "")
ADMIN_JWT_SECRET = get_setting("OUTLOOK_MAIL_STATION_ADMIN_JWT_SECRET", "")
