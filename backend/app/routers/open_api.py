"""Open API routes protected by fixed secret or bearer token."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel import Session, select

from ..auth import require_open_api_auth
from ..database import get_session
from ..models import MailMessage, OutlookAccount, ShareToken, utcnow
from ..schemas import (
    ImportAccountsRequest,
    ImportAccountsResponse,
    MessageDetailResponse,
    OperationStatusResponse,
    OpenMailboxLatestResponse,
    OpenMailboxListResponse,
    RandomMailboxRequest,
    RandomMailboxResponse,
    ShareCreateRequest,
    ShareCreateResponse,
)
from ..settings import DEFAULT_SYNC_LIMIT, OPEN_API_DEFAULT_LEASE_SECONDS
from .accounts import _normalize_import_records, upsert_outlook_accounts
from .messages import _serialize_message, maybe_sync_account_mailbox
from .public_share import create_share_for_account


router = APIRouter(prefix="/open", tags=["open-api"], dependencies=[Depends(require_open_api_auth)])


def _find_account_by_email(session: Session, email: str) -> OutlookAccount:
    """AI by zb: 按邮箱地址查找 Outlook 账号，优先精确匹配。"""
    normalized = str(email or "").strip()
    account = session.exec(select(OutlookAccount).where(OutlookAccount.email == normalized)).first()
    if account:
        return account
    lowered = normalized.lower()
    items = session.exec(select(OutlookAccount)).all()
    for item in items:
        if item.email.lower() == lowered:
            return item
    raise HTTPException(status_code=404, detail="邮箱不存在")


def _parse_since(value: str | None) -> datetime | None:
    """AI by zb: 解析开放接口传入的 since 时间。"""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="since 时间格式无效，需传 ISO8601") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _normalize_dt(value: datetime | None) -> datetime | None:
    """AI by zb: 统一处理数据库里读出的时间字段。"""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.post("/import", response_model=ImportAccountsResponse)
def open_import(
    request: ImportAccountsRequest,
    session: Session = Depends(get_session),
):
    """AI by zb: 通过固定密钥开放批量导入 Outlook 邮箱。"""
    records = _normalize_import_records(request.data)
    return upsert_outlook_accounts(
        session,
        records=records,
        enabled=bool(request.enabled),
        batch_code=request.batch_code,
    )


@router.post("/random-email", response_model=RandomMailboxResponse)
def random_email(
    request: RandomMailboxRequest,
    session: Session = Depends(get_session),
):
    """AI by zb: 随机分配一个未被租用中的邮箱。"""
    domain = str(request.domain or "").strip().lower().lstrip("@")
    batch_code = str(request.batch_code or "").strip()
    lease_seconds = request.lease_seconds or OPEN_API_DEFAULT_LEASE_SECONDS
    now = utcnow()

    accounts = session.exec(select(OutlookAccount).where(OutlookAccount.enabled == True)).all()
    candidates: list[OutlookAccount] = []
    for account in accounts:
        if domain and not account.email.lower().endswith("@" + domain):
            continue
        if batch_code and account.batch_code != batch_code:
            continue
        lease_until = _normalize_dt(account.lease_expires_at)
        if lease_until and lease_until > now:
            continue
        candidates.append(account)

    if not candidates:
        raise HTTPException(status_code=404, detail="没有可分配的邮箱")

    picked = random.SystemRandom().choice(candidates)
    picked.lease_expires_at = now + timedelta(seconds=lease_seconds)
    picked.last_leased_at = now
    picked.updated_at = now
    session.add(picked)
    session.commit()
    session.refresh(picked)

    return RandomMailboxResponse(
        id=picked.id or 0,
        email=picked.email,
        domain=picked.email.split("@", 1)[1] if "@" in picked.email else "",
        batch_code=picked.batch_code,
        lease_expires_at=picked.lease_expires_at,
    )


@router.get("/mailboxes/{email}/latest", response_model=OpenMailboxLatestResponse)
def latest_message(
    email: str,
    refresh: bool = Query(default=True),
    session: Session = Depends(get_session),
):
    """AI by zb: 获取指定邮箱最新一封收件邮件，并按需触发同步。"""
    account = _find_account_by_email(session, email)
    try:
        maybe_sync_account_mailbox(session, account, refresh=refresh, limit=DEFAULT_SYNC_LIMIT)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    items = session.exec(
        select(MailMessage)
        .where(MailMessage.account_id == (account.id or 0))
        .where(MailMessage.folder.in_(["inbox", "junk"]))
        .order_by(MailMessage.sent_at.desc(), MailMessage.updated_at.desc())
    ).all()
    if not items:
        return OpenMailboxLatestResponse(account_id=account.id or 0, email=account.email, message=None)

    current = items[0]
    return OpenMailboxLatestResponse(
        account_id=account.id or 0,
        email=account.email,
        message=MessageDetailResponse(
            id=current.id or 0,
            folder=current.folder,
            subject=current.subject,
            sender_name=current.sender_name,
            sender_email=current.sender_email,
            recipient_summary=current.recipient_summary,
            preview=current.preview,
            sent_at=current.sent_at,
            body_text=current.body_text,
            body_html=current.body_html,
        ),
    )


@router.get("/mailboxes/{email}/messages", response_model=OpenMailboxListResponse)
def mailbox_messages(
    email: str,
    refresh: bool = Query(default=True),
    since: str = Query(default=""),
    folder: str = Query(default="inbox"),
    session: Session = Depends(get_session),
):
    """AI by zb: 获取指定邮箱的邮件列表，并支持按时间过滤。"""
    account = _find_account_by_email(session, email)
    try:
        maybe_sync_account_mailbox(session, account, refresh=refresh, limit=DEFAULT_SYNC_LIMIT)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    folders = [folder]
    if folder == "inbox":
        folders.append("junk")
    threshold = _parse_since(since)

    items = session.exec(
        select(MailMessage)
        .where(MailMessage.account_id == (account.id or 0))
        .where(MailMessage.folder.in_(folders))
        .order_by(MailMessage.sent_at.desc(), MailMessage.updated_at.desc())
    ).all()
    if threshold is not None:
        items = [
            item
            for item in items
            if (_normalize_dt(item.sent_at) or _normalize_dt(item.updated_at) or utcnow()) >= threshold
        ]

    serialized = [_serialize_message(item) for item in items]
    return OpenMailboxListResponse(
        account_id=account.id or 0,
        email=account.email,
        count=len(serialized),
        items=serialized,
    )


@router.post("/mailboxes/{email}/share", response_model=ShareCreateResponse)
def create_mailbox_share(
    email: str,
    request: Request,
    payload: ShareCreateRequest,
    session: Session = Depends(get_session),
):
    """AI by zb: 通过开放接口为指定邮箱生成临时授权链接。"""
    account = _find_account_by_email(session, email)
    return create_share_for_account(
        session,
        account=account,
        base_url=str(request.base_url),
        days=payload.days,
    )


@router.post("/mailboxes/{email}/share/revoke", response_model=OperationStatusResponse)
def revoke_mailbox_share(
    email: str,
    session: Session = Depends(get_session),
):
    """AI by zb: 手动废止指定邮箱当前有效的临时授权。"""
    account = _find_account_by_email(session, email)
    shares = session.exec(select(ShareToken).where(ShareToken.account_id == (account.id or 0))).all()
    for share in shares:
        session.delete(share)
    session.commit()
    return OperationStatusResponse(
        ok=True,
        email=account.email,
        message="当前邮箱的临时授权已废止",
    )


@router.post("/mailboxes/{email}/lease/release", response_model=OperationStatusResponse)
def release_mailbox_lease(
    email: str,
    session: Session = Depends(get_session),
):
    """AI by zb: 释放指定邮箱当前的随机租约状态。"""
    account = _find_account_by_email(session, email)
    account.lease_expires_at = None
    account.updated_at = utcnow()
    session.add(account)
    session.commit()
    session.refresh(account)
    return OperationStatusResponse(
        ok=True,
        email=account.email,
        message="邮箱租约已释放",
    )
