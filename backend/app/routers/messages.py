"""Message routes for Outlook Mail Station."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import MailMessage, OutlookAccount, utcnow
from ..schemas import MessageDetailResponse, MessageItemResponse, SendMailRequest, SyncResponse
from ..services.mail_sync_service import _message_matches_account_email
from ..services.mail_sync_service import sync_account_mailbox
from ..services.outlook_service import OutlookService
from ..settings import DEFAULT_SYNC_LIMIT


router = APIRouter(tags=["messages"])


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
    items = [item for item in items if _message_matches_account_email(account.email, item.recipient_summary, item.folder)]
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


@router.get("/accounts/{account_id}/messages/{message_id}", response_model=MessageDetailResponse)
def get_account_message(
    account_id: int,
    message_id: int,
    session: Session = Depends(get_session),
):
    """AI by zb: 返回指定邮箱下某封邮件的完整详情，并校验归属关系。"""
    account = _get_account_or_404(session, account_id)
    message = session.get(MailMessage, message_id)
    if not message or message.account_id != account_id or not _message_matches_account_email(account.email, message.recipient_summary, message.folder):
        raise HTTPException(status_code=404, detail="邮件不存在或不属于当前邮箱")
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
