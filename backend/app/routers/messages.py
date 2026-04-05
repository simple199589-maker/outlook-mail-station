"""Message routes for Outlook Mail Station."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import MailMessage, OutlookAccount, utcnow
from ..schemas import MessageDetailResponse, MessageItemResponse, SendMailRequest, SyncResponse
from ..services.outlook_service import OutlookService
from ..settings import DEFAULT_SYNC_LIMIT, OPEN_API_SYNC_COOLDOWN_SECONDS


router = APIRouter(tags=["messages"])


def _normalize_datetime(value: datetime | None) -> datetime | None:
    """AI by zb: 将数据库中读出的时间统一归一到 UTC。"""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _get_account_or_404(session: Session, account_id: int) -> OutlookAccount:
    """AI by zb: 统一获取 Outlook 账号，不存在时抛出 404。"""
    account = session.get(OutlookAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="邮箱不存在")
    if not account.enabled:
        raise HTTPException(status_code=400, detail="该邮箱已停用")
    return account


def _serialize_message(message: MailMessage) -> MessageItemResponse:
    """AI by zb: 序列化邮件列表项。"""
    return MessageItemResponse(
        id=message.id or 0,
        folder=message.folder,
        subject=message.subject,
        sender_name=message.sender_name,
        sender_email=message.sender_email,
        recipient_summary=message.recipient_summary,
        preview=message.preview,
        sent_at=message.sent_at,
    )


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


def sync_account_mailbox(session: Session, account: OutlookAccount, limit: int = DEFAULT_SYNC_LIMIT) -> SyncResponse:
    """AI by zb: 同步指定账号的收件箱与发件箱到本地缓存。"""
    service = OutlookService(account)
    folders = service.fetch_mailbox_messages(limit=limit)
    inbox = folders["inbox"]
    junk = folders["junk"]
    sent = folders["sent"]

    for item in inbox:
        _upsert_message(session, account.id or 0, item)
    for item in junk:
        _upsert_message(session, account.id or 0, item)
    for item in sent:
        _upsert_message(session, account.id or 0, item)

    next_refresh_token = service.refresh_token_for_storage()
    if next_refresh_token and next_refresh_token != account.refresh_token:
        account.refresh_token = next_refresh_token

    account.last_synced_at = utcnow()
    account.updated_at = utcnow()
    account.last_error = ""
    session.add(account)
    session.commit()
    session.refresh(account)

    return SyncResponse(
        account_id=account.id or 0,
        synced_at=account.last_synced_at,
        inbox_count=len(inbox) + len(junk),
        sent_count=len(sent),
    )


def maybe_sync_account_mailbox(
    session: Session,
    account: OutlookAccount,
    *,
    refresh: bool = True,
    limit: int = DEFAULT_SYNC_LIMIT,
) -> SyncResponse | None:
    """AI by zb: 按需触发邮箱同步，避免同一邮箱被短时间内重复刷新。"""
    if not refresh:
        return None

    last_synced = _normalize_datetime(account.last_synced_at)
    now = utcnow()
    if last_synced is not None:
        elapsed = (now - last_synced).total_seconds()
        if elapsed < OPEN_API_SYNC_COOLDOWN_SECONDS:
            return None
    return sync_account_mailbox(session, account, limit=limit)


@router.post("/accounts/{account_id}/sync", response_model=SyncResponse)
def sync_messages(
    account_id: int,
    limit: int = Query(default=DEFAULT_SYNC_LIMIT, ge=1, le=100),
    session: Session = Depends(get_session),
):
    """AI by zb: 手动刷新指定邮箱的收件箱与发件箱缓存。"""
    account = _get_account_or_404(session, account_id)
    try:
        return sync_account_mailbox(session, account, limit=limit)
    except Exception as exc:
        account.last_error = str(exc)
        account.updated_at = utcnow()
        session.add(account)
        session.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/accounts/{account_id}/messages", response_model=list[MessageItemResponse])
def list_messages(
    account_id: int,
    folder: str = Query(default="inbox"),
    session: Session = Depends(get_session),
):
    """AI by zb: 返回指定邮箱某个文件夹下的本地缓存邮件列表。"""
    _get_account_or_404(session, account_id)
    folders = [folder]
    if folder == "inbox":
        folders.append("junk")
    items = session.exec(
        select(MailMessage)
        .where(MailMessage.account_id == account_id)
        .where(MailMessage.folder.in_(folders))
        .order_by(MailMessage.sent_at.desc(), MailMessage.updated_at.desc())
    ).all()
    return [_serialize_message(item) for item in items]


@router.get("/messages/{message_id}", response_model=MessageDetailResponse)
def get_message(message_id: int, session: Session = Depends(get_session)):
    """AI by zb: 返回单封邮件的完整详情。"""
    message = session.get(MailMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="邮件不存在")
    return MessageDetailResponse(
        id=message.id or 0,
        folder=message.folder,
        subject=message.subject,
        sender_name=message.sender_name,
        sender_email=message.sender_email,
        recipient_summary=message.recipient_summary,
        preview=message.preview,
        sent_at=message.sent_at,
        body_text=message.body_text,
        body_html=message.body_html,
    )


@router.post("/accounts/{account_id}/send")
def send_message(
    account_id: int,
    request: SendMailRequest,
    session: Session = Depends(get_session),
):
    """AI by zb: 使用指定邮箱发送邮件。"""
    account = _get_account_or_404(session, account_id)
    service = OutlookService(account)
    try:
        service.send_mail(
            to=request.to,
            cc=request.cc,
            bcc=request.bcc,
            subject=request.subject,
            body_text=request.body_text,
            body_html=request.body_html,
        )
        account.last_error = ""
        account.updated_at = utcnow()
        session.add(account)
        session.commit()
        return {"ok": True}
    except Exception as exc:
        account.last_error = str(exc)
        account.updated_at = utcnow()
        session.add(account)
        session.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
