"""Mailbox sync orchestration for Outlook Mail Station."""

from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone
from typing import Iterable, Sequence

from sqlmodel import Session, select

from ..database import session_scope
from ..models import AccountSiteUsage, MailMessage, OutlookAccount, utcnow
from ..schemas import SyncResponse
from ..settings import (
    ACTIVE_MAILBOX_SYNC_INTERVAL_SECONDS,
    ACTIVE_MAILBOX_SYNC_LIMIT,
    ACTIVE_MAILBOX_SYNC_STALE_SECONDS,
    DEFAULT_SYNC_LIMIT,
    OPEN_API_SYNC_COOLDOWN_SECONDS,
)
from .outlook_service import FolderSyncResult, OutlookService


LOGGER = logging.getLogger(__name__)
SYNC_FOLDERS_ALL: tuple[str, ...] = ("inbox", "junk", "sent")
SYNC_FOLDERS_INBOUND: tuple[str, ...] = ("inbox", "junk")
_FOLDER_UID_FIELD_MAP = {
    "inbox": "inbox_last_uid",
    "junk": "junk_last_uid",
    "sent": "sent_last_uid",
}
_ACCOUNT_SYNC_LOCKS: dict[int, threading.Lock] = {}
_ACCOUNT_SYNC_LOCKS_GUARD = threading.Lock()


def _normalize_datetime(value: datetime | None) -> datetime | None:
    """AI by zb: 将数据库中读出的时间统一归一到 UTC。"""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_sync_folders(folders: Iterable[str] | None) -> tuple[str, ...]:
    """AI by zb: 过滤并规范允许同步的文件夹集合。"""
    resolved: list[str] = []
    for item in folders or SYNC_FOLDERS_ALL:
        folder = str(item or "").strip().lower()
        if folder in _FOLDER_UID_FIELD_MAP and folder not in resolved:
            resolved.append(folder)
    return tuple(resolved or SYNC_FOLDERS_ALL)


def _get_account_sync_lock(account_id: int) -> threading.Lock:
    """AI by zb: 返回指定邮箱在当前进程内唯一的同步锁。"""
    with _ACCOUNT_SYNC_LOCKS_GUARD:
        lock = _ACCOUNT_SYNC_LOCKS.get(account_id)
        if lock is None:
            lock = threading.Lock()
            _ACCOUNT_SYNC_LOCKS[account_id] = lock
        return lock


def _get_folder_last_uid(account: OutlookAccount, folder: str) -> int | None:
    """AI by zb: 读取账号在指定文件夹上的增量同步游标。"""
    field_name = _FOLDER_UID_FIELD_MAP.get(folder)
    value = getattr(account, field_name, None) if field_name else None
    if isinstance(value, int):
        return value
    return None


def _set_folder_last_uid(account: OutlookAccount, folder: str, value: int | None) -> None:
    """AI by zb: 回写账号在指定文件夹上的最新增量同步游标。"""
    field_name = _FOLDER_UID_FIELD_MAP.get(folder)
    if not field_name or value is None or value <= 0:
        return
    setattr(account, field_name, value)


def _upsert_message(session: Session, account_id: int, synced) -> None:
    """AI by zb: 将同步得到的邮件更新到本地缓存表。"""
    existing = session.exec(select(MailMessage).where(MailMessage.message_key == synced.message_key)).first()
    if existing:
        existing.sender_name = synced.sender_name
        existing.sender_email = synced.sender_email
        existing.recipient_summary = synced.recipient_summary
        existing.subject = synced.subject
        existing.preview = synced.preview
        existing.body_text = synced.body_text
        existing.body_html = synced.body_html
        existing.sent_at = synced.sent_at
        existing.updated_at = utcnow()
        session.add(existing)
        return

    session.add(
        MailMessage(
            account_id=account_id,
            folder=synced.folder,
            message_key=synced.message_key,
            remote_uid=synced.remote_uid,
            internet_message_id=synced.internet_message_id,
            sender_name=synced.sender_name,
            sender_email=synced.sender_email,
            recipient_summary=synced.recipient_summary,
            subject=synced.subject,
            preview=synced.preview,
            body_text=synced.body_text,
            body_html=synced.body_html,
            sent_at=synced.sent_at,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
    )


def _has_cached_messages(session: Session, account_id: int, folders: Sequence[str]) -> bool:
    """AI by zb: 判断指定邮箱在目标文件夹中是否已有可回退的缓存邮件。"""
    return (
        session.exec(
            select(MailMessage)
            .where(MailMessage.account_id == account_id)
            .where(MailMessage.folder.in_(list(folders)))
            .limit(1)
        ).first()
        is not None
    )


def _build_sync_response(account_id: int, synced_at: datetime, results: dict[str, FolderSyncResult]) -> SyncResponse:
    """AI by zb: 把文件夹同步结果整合为接口返回结构。"""
    inbox_count = len(results.get("inbox", FolderSyncResult("inbox", "inbox", [], None)).messages)
    inbox_count += len(results.get("junk", FolderSyncResult("junk", "junk", [], None)).messages)
    sent_count = len(results.get("sent", FolderSyncResult("sent", "sent", [], None)).messages)
    return SyncResponse(
        account_id=account_id,
        synced_at=synced_at,
        inbox_count=inbox_count,
        sent_count=sent_count,
    )


def _sync_account_mailbox_locked(
    session: Session,
    account: OutlookAccount,
    *,
    limit: int,
    folders: Sequence[str],
) -> SyncResponse:
    """AI by zb: 在已持有邮箱锁的前提下执行一次同步并落库。"""
    if account.id is None:
        raise RuntimeError("邮箱不存在，无法同步")

    service = OutlookService(account)
    folder_last_uids = {folder: _get_folder_last_uid(account, folder) for folder in folders}
    results = service.fetch_mailbox_messages(limit=limit, folders=folders, last_uids=folder_last_uids)

    for folder in folders:
        result = results.get(folder)
        if result is None:
            continue
        for item in result.messages:
            _upsert_message(session, account.id, item)
        _set_folder_last_uid(account, folder, result.high_water_uid)

    next_refresh_token = service.refresh_token_for_storage()
    if next_refresh_token and next_refresh_token != account.refresh_token:
        account.refresh_token = next_refresh_token

    account.last_synced_at = utcnow()
    account.updated_at = utcnow()
    account.last_error = ""
    session.add(account)
    session.commit()
    session.refresh(account)
    return _build_sync_response(account.id, account.last_synced_at, results)


def sync_account_mailbox(
    session: Session,
    account: OutlookAccount,
    *,
    limit: int = DEFAULT_SYNC_LIMIT,
    folders: Iterable[str] | None = None,
) -> SyncResponse:
    """AI by zb: 同步指定账号的目标文件夹到本地缓存。"""
    if account.id is None:
        raise RuntimeError("邮箱不存在，无法同步")
    target_folders = _normalize_sync_folders(folders)
    lock = _get_account_sync_lock(account.id)
    with lock:
        session.refresh(account)
        try:
            return _sync_account_mailbox_locked(session, account, limit=limit, folders=target_folders)
        except Exception as exc:
            account.last_error = str(exc)
            account.updated_at = utcnow()
            session.add(account)
            session.commit()
            raise


def maybe_sync_account_mailbox(
    session: Session,
    account: OutlookAccount,
    *,
    refresh: bool = True,
    limit: int = DEFAULT_SYNC_LIMIT,
    folders: Iterable[str] | None = None,
    cooldown_seconds: int = OPEN_API_SYNC_COOLDOWN_SECONDS,
    allow_stale_on_error: bool = False,
) -> SyncResponse | None:
    """AI by zb: 按需触发邮箱同步，必要时允许回退本地缓存。"""
    if not refresh:
        return None
    if account.id is None:
        raise RuntimeError("邮箱不存在，无法同步")

    target_folders = _normalize_sync_folders(folders)
    lock = _get_account_sync_lock(account.id)
    with lock:
        session.refresh(account)
        last_synced = _normalize_datetime(account.last_synced_at)
        if cooldown_seconds > 0 and last_synced is not None:
            elapsed = (utcnow() - last_synced).total_seconds()
            if elapsed < cooldown_seconds:
                return None

        try:
            return _sync_account_mailbox_locked(session, account, limit=limit, folders=target_folders)
        except Exception as exc:
            account.last_error = str(exc)
            account.updated_at = utcnow()
            session.add(account)
            session.commit()
            if allow_stale_on_error and _has_cached_messages(session, account.id, target_folders):
                session.refresh(account)
                return None
            raise


def sync_active_mailboxes_once() -> int:
    """AI by zb: 对当前被站点占用的邮箱执行一轮轻量预热同步。"""
    with session_scope() as session:
        usages = session.exec(
            select(AccountSiteUsage)
            .where(AccountSiteUsage.released_at.is_(None))
            .order_by(AccountSiteUsage.updated_at.asc(), AccountSiteUsage.id.asc())
        ).all()
        account_ids = sorted({usage.account_id for usage in usages if usage.account_id})
        synced_count = 0
        for account_id in account_ids:
            account = session.get(OutlookAccount, account_id)
            if not account or not account.enabled:
                continue
            try:
                result = maybe_sync_account_mailbox(
                    session,
                    account,
                    refresh=True,
                    limit=ACTIVE_MAILBOX_SYNC_LIMIT,
                    folders=SYNC_FOLDERS_INBOUND,
                    cooldown_seconds=ACTIVE_MAILBOX_SYNC_STALE_SECONDS,
                    allow_stale_on_error=True,
                )
                if result is not None:
                    synced_count += 1
            except Exception:
                LOGGER.exception("活跃邮箱后台预热失败: account_id=%s email=%s", account_id, account.email)
        return synced_count


async def run_active_mailbox_sync_loop(stop_event: asyncio.Event) -> None:
    """AI by zb: 持续预热活跃邮箱，直到应用关闭。"""
    if ACTIVE_MAILBOX_SYNC_INTERVAL_SECONDS <= 0:
        LOGGER.info("活跃邮箱后台预热已关闭")
        return

    LOGGER.info(
        "活跃邮箱后台预热已启动: interval=%ss stale=%ss limit=%s",
        ACTIVE_MAILBOX_SYNC_INTERVAL_SECONDS,
        ACTIVE_MAILBOX_SYNC_STALE_SECONDS,
        ACTIVE_MAILBOX_SYNC_LIMIT,
    )
    while not stop_event.is_set():
        try:
            synced_count = await asyncio.to_thread(sync_active_mailboxes_once)
            if synced_count > 0:
                LOGGER.info("活跃邮箱后台预热完成，本轮实际同步 %s 个邮箱", synced_count)
        except Exception:
            LOGGER.exception("活跃邮箱后台预热循环异常")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=ACTIVE_MAILBOX_SYNC_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue
