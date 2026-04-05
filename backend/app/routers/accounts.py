"""Account management routes for Outlook Mail Station."""

from __future__ import annotations

import json
import math
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlmodel import Session, select

from ..database import get_session
from ..models import MailMessage, OutlookAccount, ShareToken, utcnow
from ..schemas import (
    AccountDetailResponse,
    AccountListItem,
    AccountListResponse,
    ImportAccountsRequest,
    ImportAccountsResponse,
    ImportResultItem,
    UpdateAccountRequest,
)


router = APIRouter(prefix="/accounts", tags=["accounts"])


def _normalize_import_records(data: str) -> list[dict[str, Any]]:
    """AI by zb: 将文本或 JSON 导入内容标准化为统一记录结构。"""
    payload = str(data or "").strip()
    if not payload:
        return []
    try:
        parsed = json.loads(payload)
        return _normalize_json_records(parsed)
    except Exception:
        return _normalize_text_records(payload)


def _normalize_json_records(parsed: Any) -> list[dict[str, Any]]:
    """AI by zb: 处理 JSON 数组或对象形式的 Outlook 导入内容。"""
    if isinstance(parsed, dict):
        parsed = parsed.get("accounts") or parsed.get("items") or [parsed]
    if not isinstance(parsed, list):
        raise ValueError("JSON 导入内容必须是数组或对象")

    records: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        records.append(
            {
                "email": str(item.get("email") or item.get("address") or "").strip(),
                "password": str(item.get("password") or "").strip(),
                "client_id": str(item.get("client_id") or item.get("clientId") or "").strip(),
                "refresh_token": str(item.get("refresh_token") or item.get("refreshToken") or "").strip(),
                "note": str(item.get("note") or item.get("remark") or "").strip(),
            }
        )
    return records


def _normalize_text_records(payload: str) -> list[dict[str, Any]]:
    """AI by zb: 处理每行 `----` 分隔的 Outlook 文本导入内容。"""
    records: list[dict[str, Any]] = []
    for raw_line in payload.splitlines():
        line = str(raw_line or "").strip()
        if not line or line.startswith("#"):
            continue
        parts = [part.strip() for part in line.split("----")]
        records.append(
            {
                "email": parts[0] if len(parts) >= 1 else "",
                "password": parts[1] if len(parts) >= 2 else "",
                "client_id": parts[2] if len(parts) >= 3 else "",
                "refresh_token": parts[3] if len(parts) >= 4 else "",
                "note": parts[4] if len(parts) >= 5 else "",
            }
        )
    return records


def _count_folder_messages(session: Session, account_id: int, folder: str) -> int:
    """AI by zb: 统计账号在指定文件夹中缓存的邮件数量。"""
    folders = [folder]
    if folder == "inbox":
        folders.append("junk")
    items = session.exec(
        select(MailMessage).where(MailMessage.account_id == account_id).where(MailMessage.folder.in_(folders))
    ).all()
    return len(items)


def _build_account_item(session: Session, account: OutlookAccount) -> AccountListItem:
    """AI by zb: 构建左侧邮箱列表使用的账号对象。"""
    return AccountListItem(
        id=account.id or 0,
        email=account.email,
        enabled=account.enabled,
        is_pinned=account.is_pinned,
        batch_code=account.batch_code,
        note=account.note,
        created_at=account.created_at,
        updated_at=account.updated_at,
        last_synced_at=account.last_synced_at,
        last_error=account.last_error,
        inbox_count=_count_folder_messages(session, account.id or 0, "inbox"),
        sent_count=_count_folder_messages(session, account.id or 0, "sent"),
    )


def _build_account_detail(session: Session, account: OutlookAccount) -> AccountDetailResponse:
    """AI by zb: 构建右侧当前邮箱区域使用的详情对象。"""
    return AccountDetailResponse(
        id=account.id or 0,
        email=account.email,
        enabled=account.enabled,
        is_pinned=account.is_pinned,
        batch_code=account.batch_code,
        note=account.note,
        last_synced_at=account.last_synced_at,
        last_error=account.last_error,
        inbox_count=_count_folder_messages(session, account.id or 0, "inbox"),
        sent_count=_count_folder_messages(session, account.id or 0, "sent"),
        has_password=bool(account.password),
        has_oauth=bool(account.client_id and account.refresh_token),
    )


def upsert_outlook_accounts(
    session: Session,
    *,
    records: list[dict[str, Any]],
    enabled: bool,
    batch_code: str = "",
) -> ImportAccountsResponse:
    """AI by zb: 统一执行 Outlook 账号的新增或更新。"""
    created = 0
    updated = 0
    failed = 0
    items: list[ImportResultItem] = []
    errors: list[str] = []
    normalized_batch = str(batch_code or "").strip()

    for index, record in enumerate(records, start=1):
        email = str(record.get("email") or "").strip()
        password = str(record.get("password") or "").strip()
        client_id = str(record.get("client_id") or "").strip()
        refresh_token = str(record.get("refresh_token") or "").strip()
        note = str(record.get("note") or "").strip()

        if "@" not in email:
            failed += 1
            errors.append(f"第 {index} 条邮箱无效: {email or '空'}")
            continue
        if not password and not (client_id and refresh_token):
            failed += 1
            errors.append(f"第 {index} 条缺少密码或 OAuth 凭据: {email}")
            continue

        existing = session.exec(select(OutlookAccount).where(OutlookAccount.email == email)).first()
        if existing:
            existing.password = password or existing.password
            existing.client_id = client_id or existing.client_id
            existing.refresh_token = refresh_token or existing.refresh_token
            existing.batch_code = normalized_batch or existing.batch_code
            existing.note = note or existing.note
            existing.enabled = bool(enabled)
            existing.updated_at = utcnow()
            session.add(existing)
            session.commit()
            session.refresh(existing)
            updated += 1
            items.append(ImportResultItem(email=email, action="updated", id=existing.id))
            continue

        account = OutlookAccount(
            email=email,
            password=password,
            client_id=client_id,
            refresh_token=refresh_token,
            batch_code=normalized_batch,
            note=note,
            enabled=bool(enabled),
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        session.add(account)
        session.commit()
        session.refresh(account)
        created += 1
        items.append(ImportResultItem(email=email, action="created", id=account.id))

    return ImportAccountsResponse(
        total=len(records),
        created=created,
        updated=updated,
        failed=failed,
        items=items,
        errors=errors,
    )


@router.get("", response_model=AccountListResponse)
def list_accounts(
    query: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
):
    """AI by zb: 返回前端左侧展示的 Outlook 邮箱分页列表。"""
    filters = []
    if query.strip():
        text = f"%{query.strip()}%"
        filters.append(
            or_(
                OutlookAccount.email.ilike(text),
                OutlookAccount.note.ilike(text),
                OutlookAccount.batch_code.ilike(text),
            )
        )

    total_statement = select(func.count()).select_from(OutlookAccount)
    for current_filter in filters:
        total_statement = total_statement.where(current_filter)
    total = int(session.exec(total_statement).one() or 0)
    total_pages = max(1, math.ceil(total / page_size)) if total else 1
    current_page = min(page, total_pages)

    items_statement = select(OutlookAccount)
    for current_filter in filters:
        items_statement = items_statement.where(current_filter)
    items_statement = items_statement.order_by(
        OutlookAccount.is_pinned.desc(),
        OutlookAccount.pinned_at.desc(),
        OutlookAccount.updated_at.desc(),
    ).offset((current_page - 1) * page_size).limit(page_size)

    accounts = session.exec(items_statement).all()
    return AccountListResponse(
        items=[_build_account_item(session, account) for account in accounts],
        total=total,
        page=current_page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/import", response_model=ImportAccountsResponse)
def import_accounts(
    request: ImportAccountsRequest,
    session: Session = Depends(get_session),
):
    """AI by zb: 批量导入或更新 Outlook 邮箱账号。"""
    records = _normalize_import_records(request.data)
    return upsert_outlook_accounts(
        session,
        records=records,
        enabled=bool(request.enabled),
        batch_code=request.batch_code,
    )


@router.get("/{account_id}", response_model=AccountDetailResponse)
def get_account(account_id: int, session: Session = Depends(get_session)):
    """AI by zb: 返回单个 Outlook 邮箱的详情信息。"""
    account = session.get(OutlookAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="邮箱不存在")
    return _build_account_detail(session, account)


@router.patch("/{account_id}", response_model=AccountDetailResponse)
def update_account(
    account_id: int,
    request: UpdateAccountRequest,
    session: Session = Depends(get_session),
):
    """AI by zb: 更新邮箱启停状态与备注。"""
    account = session.get(OutlookAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="邮箱不存在")
    if request.enabled is not None:
        account.enabled = request.enabled
    if request.note is not None:
        account.note = request.note.strip()
    if request.is_pinned is not None:
        account.is_pinned = request.is_pinned
        account.pinned_at = utcnow() if request.is_pinned else None
    account.updated_at = utcnow()
    session.add(account)
    session.commit()
    session.refresh(account)
    return _build_account_detail(session, account)


@router.delete("/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)):
    """AI by zb: 删除邮箱及其本地缓存邮件与分享链接。"""
    account = session.get(OutlookAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="邮箱不存在")

    messages = session.exec(select(MailMessage).where(MailMessage.account_id == account_id)).all()
    shares = session.exec(select(ShareToken).where(ShareToken.account_id == account_id)).all()
    for message in messages:
        session.delete(message)
    for share in shares:
        session.delete(share)
    session.delete(account)
    session.commit()
    return {"ok": True, "deleted_at": datetime.now().isoformat()}
