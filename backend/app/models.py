"""Database models for Outlook Mail Station."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


USER_ROLE_ADMIN = "admin"
USER_ROLE_USER = "user"
SITE_SOURCE_MANUAL = "manual"
SITE_SOURCE_OPEN_API = "open_api"


def utcnow() -> datetime:
    """AI by zb: 统一返回带时区的 UTC 时间。"""
    return datetime.now(timezone.utc)


def generate_station_api_key() -> str:
    """AI by zb: 生成用户级开放接口使用的随机 API Key。"""
    return f"oms_{secrets.token_urlsafe(24)}"


class StationUser(SQLModel, table=True):
    """AI by zb: 存储后台登录用户及其角色信息。"""

    __tablename__ = "station_users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, sa_column_kwargs={"unique": True})
    password: str = ""
    role: str = Field(default=USER_ROLE_USER, index=True)
    api_key: Optional[str] = None
    last_imported_at: Optional[datetime] = None
    enabled: bool = True
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Site(SQLModel, table=True):
    """AI by zb: 存储管理员可维护的固定站点信息。"""

    __tablename__ = "sites"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, sa_column_kwargs={"unique": True})
    name: str = ""
    enabled: bool = True
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class OutlookAccount(SQLModel, table=True):
    """AI by zb: 存储归属于某个用户池的 Outlook 账号信息。"""

    __tablename__ = "outlook_accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_user_id: Optional[int] = Field(default=None, index=True)
    email: str = Field(index=True, sa_column_kwargs={"unique": True})
    password: str = ""
    client_id: str = ""
    refresh_token: str = ""
    batch_code: str = Field(default="", index=True)
    enabled: bool = True
    note: str = ""
    is_pinned: bool = False
    pinned_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_synced_at: Optional[datetime] = None
    last_error: str = ""
    inbox_last_uid: Optional[int] = Field(default=None, index=True)
    junk_last_uid: Optional[int] = Field(default=None, index=True)
    sent_last_uid: Optional[int] = Field(default=None, index=True)


class AccountSiteUsage(SQLModel, table=True):
    """AI by zb: 存储邮箱被哪些站点使用的活动与历史记录。"""

    __tablename__ = "account_site_usages"

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(index=True)
    site_id: int = Field(index=True)
    user_id: int = Field(index=True)
    source: str = Field(default=SITE_SOURCE_MANUAL, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    released_at: Optional[datetime] = None


class MailMessage(SQLModel, table=True):
    """AI by zb: 缓存 Outlook 同步下来的邮件列表与正文摘要。"""

    __tablename__ = "mail_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(index=True)
    folder: str = Field(index=True)
    message_key: str = Field(index=True, sa_column_kwargs={"unique": True})
    remote_uid: str = ""
    internet_message_id: str = ""
    sender_name: str = ""
    sender_email: str = ""
    recipient_summary: str = ""
    subject: str = ""
    preview: str = ""
    body_text: str = ""
    body_html: str = ""
    sent_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ShareToken(SQLModel, table=True):
    """AI by zb: 存储临时公开访问链接。"""

    __tablename__ = "share_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(index=True, sa_column_kwargs={"unique": True})
    account_id: int = Field(index=True)
    expires_at: datetime = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow)
