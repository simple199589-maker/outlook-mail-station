"""Public share routes for Outlook Mail Station."""

from __future__ import annotations

import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from ..database import get_session
from ..models import MailMessage, OutlookAccount, ShareToken, utcnow
from ..schemas import MessageDetailResponse, PublicShareResponse, ShareCreateRequest, ShareCreateResponse
from ..services.mail_sync_service import sync_account_mailbox
from ..services.site_usage_service import load_site_map
from ..settings import DEFAULT_SHARE_DAYS
from .accounts import _load_owner_map, _serialize_detail
from .messages import _serialize_message


router = APIRouter(tags=["public-share"])


def _normalize_datetime(value):
    """AI by zb: 将数据库中的时间统一转换为可比较的 UTC 时间。"""
    if value is None:
        return None
    if getattr(value, "tzinfo", None) is None:
        return value.replace(tzinfo=utcnow().tzinfo)
    return value


def _get_active_share(session: Session, token: str) -> ShareToken:
    """AI by zb: 读取并校验仍在有效期内的分享令牌。"""
    share = session.exec(select(ShareToken).where(ShareToken.token == token)).first()
    if not share:
        raise HTTPException(status_code=404, detail="分享链接不存在或已被新的授权覆盖")
    if _normalize_datetime(share.expires_at) <= utcnow():
        raise HTTPException(status_code=410, detail="分享链接已过期")
    return share


def _get_share_account(session: Session, token: str) -> tuple[ShareToken, OutlookAccount]:
    """AI by zb: 基于分享令牌获取其绑定的 Outlook 账号。"""
    share = _get_active_share(session, token)
    account = session.get(OutlookAccount, share.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="邮箱不存在")
    return share, account


def _build_public_payload(session: Session, account: OutlookAccount, share: ShareToken) -> PublicShareResponse:
    """AI by zb: 组装公开访问页需要的账号与邮件数据。"""
    inbox = session.exec(
        select(MailMessage)
        .where(MailMessage.account_id == account.id)
        .where(MailMessage.folder.in_(["inbox", "junk"]))
        .order_by(MailMessage.sent_at.desc(), MailMessage.updated_at.desc())
    ).all()
    sent = session.exec(
        select(MailMessage)
        .where(MailMessage.account_id == account.id)
        .where(MailMessage.folder == "sent")
        .order_by(MailMessage.sent_at.desc(), MailMessage.updated_at.desc())
    ).all()
    owner_map = _load_owner_map(session)
    site_map = load_site_map(session)
    return PublicShareResponse(
        account=_serialize_detail(session, account, owner_map, site_map),
        inbox=[_serialize_message(item) for item in inbox],
        sent=[_serialize_message(item) for item in sent],
        expires_at=share.expires_at,
    )


def create_share_for_account(
    session: Session,
    *,
    account: OutlookAccount,
    base_url: str,
    days: int,
) -> ShareCreateResponse:
    """AI by zb: 为指定邮箱生成唯一有效的最新临时授权链接。"""
    old_shares = session.exec(select(ShareToken).where(ShareToken.account_id == (account.id or 0))).all()
    for old_share in old_shares:
        session.delete(old_share)
    session.commit()

    share = ShareToken(
        token=secrets.token_urlsafe(24),
        account_id=account.id or 0,
        expires_at=utcnow() + timedelta(days=days),
        created_at=utcnow(),
    )
    session.add(share)
    session.commit()
    session.refresh(share)
    root = str(base_url or "").rstrip("/")
    return ShareCreateResponse(
        token=share.token,
        url=f"{root}/share/{share.token}",
        expires_at=share.expires_at,
    )


@router.post("/accounts/{account_id}/shares", response_model=ShareCreateResponse)
def create_share(
    account_id: int,
    request: ShareCreateRequest,
    http_request: Request,
    session: Session = Depends(get_session),
):
    """AI by zb: 为当前邮箱生成一个可公开访问的临时授权链接。"""
    account = session.get(OutlookAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="邮箱不存在")

    days = request.days or DEFAULT_SHARE_DAYS
    return create_share_for_account(
        session,
        account=account,
        base_url=str(http_request.base_url),
        days=days,
    )


@router.get("/public/shares/{token}", response_model=PublicShareResponse)
def get_public_share(token: str, session: Session = Depends(get_session)):
    """AI by zb: 返回公开访问页面需要的只读邮箱与邮件数据。"""
    share, account = _get_share_account(session, token)
    return _build_public_payload(session, account, share)


@router.post("/public/shares/{token}/sync", response_model=PublicShareResponse)
def sync_public_share(token: str, session: Session = Depends(get_session)):
    """AI by zb: 允许公开访问链接触发只读刷新，避免再次登录。"""
    share, account = _get_share_account(session, token)
    try:
        sync_account_mailbox(session, account)
    except Exception as exc:
        account.last_error = str(exc)
        account.updated_at = utcnow()
        session.add(account)
        session.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session.refresh(account)
    return _build_public_payload(session, account, share)


@router.get("/public/shares/{token}/messages/{message_id}", response_model=MessageDetailResponse)
def get_public_share_message(token: str, message_id: int, session: Session = Depends(get_session)):
    """AI by zb: 返回分享令牌所绑定邮箱下某封邮件的详情。"""
    _, account = _get_share_account(session, token)
    message = session.get(MailMessage, message_id)
    if not message or message.account_id != account.id:
        raise HTTPException(status_code=404, detail="邮件不存在或不属于当前授权邮箱")
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
