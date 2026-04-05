"""Database models for Outlook Mail Station."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """AI by zb: 统一返回带时区的 UTC 时间。"""
    return datetime.now(timezone.utc)


class OutlookAccount(SQLModel, table=True):
    """AI by zb: 存储独立站点维护的 Outlook 账号信息。"""

    __tablename__ = "outlook_accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, sa_column_kwargs={"unique": True})
    password: str = ""
    client_id: str = ""
    refresh_token: str = ""
    batch_code: str = Field(default="", index=True)
    enabled: bool = True
    note: str = ""
    is_pinned: bool = False
    pinned_at: Optional[datetime] = None
    lease_expires_at: Optional[datetime] = None
    last_leased_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_synced_at: Optional[datetime] = None
    last_error: str = ""


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
