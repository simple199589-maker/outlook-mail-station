"""Account management routes for Outlook Mail Station."""

from __future__ import annotations

import csv
import io
import random
import re
from datetime import datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlmodel import Session, select

from ..auth import require_admin_authorization, require_admin_user
from ..database import get_session
from ..models import AccountSiteUsage, OutlookAccount, SITE_SOURCE_MANUAL, ShareToken, Site, StationUser, USER_ROLE_ADMIN, utcnow
from ..schemas import (
    AccountDetailResponse,
    AccountListItem,
    AccountListResponse,
    AccountSiteUsageSummary,
    BatchMoveAccountsRequest,
    ImportAccountsRequest,
    ImportAccountsResponse,
    ImportResultItem,
    ManualConsumeAccountRequest,
    OperationStatusResponse,
    PoolSummaryResponse,
    RandomConsumeAccountRequest,
    RandomConsumeAccountResponse,
    ReleaseAccountUsageRequest,
    UpdateAccountRequest,
)
from ..services.site_usage_service import (
    count_pool_and_consumed_accounts,
    get_active_account_site_usage,
    get_active_account_site_usages,
    get_site_by_code,
    load_site_map,
    release_all_account_site_usages,
    release_site_usage,
)


router = APIRouter(prefix="/accounts", tags=["accounts"])


def _normalize_datetime(value: datetime | None) -> datetime | None:
    """AI by zb: 把数据库中的时间统一转换为 UTC。"""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_import_line(raw_line: str) -> tuple[str, str, str, str] | None:
    """AI by zb: 解析单行导入文本并提取邮箱凭证，兼容 ---- 与逗号格式。"""
    line = raw_line.strip()
    if not line:
        return None
    if "----" in line:
        parts = [item.strip() for item in re.split(r"-{4,}", line) if item.strip()]
    else:
        parts = [item.strip() for item in line.replace("\t", ",").split(",")]
    parts = [item for item in parts if item]
    if len(parts) < 4:
        return None
    email, password, client_id, refresh_token = parts[:4]
    return email, password, client_id, refresh_token


def _get_user_or_404(session: Session, user_id: int) -> StationUser:
    """AI by zb: 获取后台用户，不存在时抛出 404。"""
    user = session.get(StationUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


def _get_account_or_404(session: Session, account_id: int) -> OutlookAccount:
    """AI by zb: 获取账号，不存在时抛出 404。"""
    account = session.get(OutlookAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="邮箱不存在")
    return account


def _get_message_counts(session: Session, account_id: int) -> tuple[int, int]:
    """AI by zb: 汇总指定邮箱的收件与发件数量。"""
    from ..models import MailMessage

    inbox = session.exec(
        select(func.count())
        .select_from(MailMessage)
        .where(MailMessage.account_id == account_id)
        .where(MailMessage.folder.in_(["inbox", "junk"]))
    ).one()
    sent = session.exec(
        select(func.count())
        .select_from(MailMessage)
        .where(MailMessage.account_id == account_id)
        .where(MailMessage.folder == "sent")
    ).one()
    return int(inbox or 0), int(sent or 0)


def _resolve_owner_name(owner_map: dict[int, str], owner_user_id: int | None) -> str:
    """AI by zb: 将归属用户 ID 映射成用户名。"""
    if owner_user_id is None:
        return ""
    return owner_map.get(owner_user_id, "")


def _load_owner_map(session: Session) -> dict[int, str]:
    """AI by zb: 加载用户 ID 到用户名的映射。"""
    users = session.exec(select(StationUser)).all()
    return {user.id or 0: user.username for user in users if user.id is not None}


def _serialize_active_sites(
    usages: list[AccountSiteUsage],
    site_map: dict[int, Site],
) -> list[AccountSiteUsageSummary]:
    """AI by zb: 将活跃站点使用记录转换为前端可用结构。"""
    serialized: list[AccountSiteUsageSummary] = []
    for usage in usages:
        site = site_map.get(usage.site_id)
        if not site:
            continue
        serialized.append(
            AccountSiteUsageSummary(
                id=usage.id or 0,
                site_id=site.id or 0,
                site_code=site.code,
                site_name=site.name or site.code,
                source=usage.source,
                used_at=usage.created_at,
            )
        )
    return serialized


def _serialize_account(
    session: Session,
    account: OutlookAccount,
    owner_map: dict[int, str],
    site_map: dict[int, Site],
) -> AccountListItem:
    """AI by zb: 统一序列化邮箱列表项。"""
    active_usages = get_active_account_site_usages(session, account.id or 0)
    inbox_count, sent_count = _get_message_counts(session, account.id or 0)
    return AccountListItem(
        id=account.id or 0,
        email=account.email,
        enabled=account.enabled,
        is_pinned=account.is_pinned,
        batch_code=account.batch_code,
        note=account.note,
        owner_user_id=account.owner_user_id,
        owner_username=_resolve_owner_name(owner_map, account.owner_user_id),
        is_consumed=bool(active_usages),
        created_at=account.created_at,
        updated_at=account.updated_at,
        last_synced_at=account.last_synced_at,
        last_error=account.last_error,
        inbox_count=inbox_count,
        sent_count=sent_count,
        active_sites=_serialize_active_sites(active_usages, site_map),
    )


def _serialize_detail(
    session: Session,
    account: OutlookAccount,
    owner_map: dict[int, str],
    site_map: dict[int, Site],
) -> AccountDetailResponse:
    """AI by zb: 统一序列化邮箱详情。"""
    item = _serialize_account(session, account, owner_map, site_map)
    return AccountDetailResponse(
        **item.model_dump(),
        has_password=bool(account.password),
        has_oauth=bool(account.client_id and account.refresh_token),
    )


def _ensure_account_visible(current_user: StationUser, account: OutlookAccount) -> None:
    """AI by zb: 校验当前用户是否可查看指定邮箱。"""
    if current_user.role == USER_ROLE_ADMIN:
        return
    if account.owner_user_id == current_user.id:
        return
    raise HTTPException(status_code=403, detail="无权查看该邮箱")


def _ensure_account_manageable(current_user: StationUser, account: OutlookAccount) -> None:
    """AI by zb: 校验当前用户是否可操作指定邮箱。"""
    if current_user.role == USER_ROLE_ADMIN:
        return
    if account.owner_user_id == current_user.id:
        return
    raise HTTPException(status_code=403, detail="无权操作该邮箱")


def _ensure_transfer_target(session: Session, owner_user_id: int) -> StationUser:
    """AI by zb: 校验批量转移目标用户是否合法。"""
    owner = _get_user_or_404(session, owner_user_id)
    if owner.role == USER_ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="不能转移到管理员用户池")
    if not owner.enabled:
        raise HTTPException(status_code=400, detail="目标用户已禁用，无法接收邮箱")
    return owner


def _collect_visible_accounts(
    session: Session,
    current_user: StationUser,
    keyword: str,
    user_id: int | None,
    scope: str,
    batch_code: str,
    site_code: str,
) -> list[AccountListItem]:
    """AI by zb: 按身份、用户、范围和批次筛选可见邮箱列表。"""
    owner_map = _load_owner_map(session)
    site_map = load_site_map(session)
    stmt = select(OutlookAccount).where(OutlookAccount.enabled == True)
    current_site = get_site_by_code(session, site_code, enabled_only=True) if site_code.strip() else None

    normalized_scope = scope if scope in {"consumed", "pool", "all"} else "consumed"
    target_user_id = user_id
    if current_user.role != USER_ROLE_ADMIN:
        target_user_id = current_user.id

    if target_user_id is not None:
        stmt = stmt.where(OutlookAccount.owner_user_id == target_user_id)
    if keyword.strip():
        stmt = stmt.where(OutlookAccount.email.contains(keyword.strip()))
    if batch_code.strip():
        stmt = stmt.where(OutlookAccount.batch_code == batch_code.strip())
    stmt = stmt.order_by(OutlookAccount.is_pinned.desc(), OutlookAccount.updated_at.desc(), OutlookAccount.id.desc())

    items: list[AccountListItem] = []
    for account in list(session.exec(stmt).all()):
        serialized = _serialize_account(session, account, owner_map, site_map)
        consumed_for_site = any(site.site_code == current_site.code for site in serialized.active_sites) if current_site else serialized.is_consumed
        if normalized_scope == "consumed" and not consumed_for_site:
            continue
        if normalized_scope == "pool" and consumed_for_site:
            continue
        serialized.is_consumed = consumed_for_site
        items.append(serialized)
    return items


def _build_export_csv(items: list[AccountListItem]) -> str:
    """AI by zb: 将邮箱列表转换为 CSV 文本。"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["email", "owner_username", "status", "scope", "sites", "inbox_count", "sent_count", "batch_code"])
    for item in items:
        writer.writerow(
            [
                item.email,
                item.owner_username,
                "启用" if item.enabled else "禁用",
                "consumed" if item.is_consumed else "pool",
                " / ".join(site.site_code for site in item.active_sites) or "",
                item.inbox_count,
                item.sent_count,
                item.batch_code or "",
            ]
        )
    return "\ufeff" + output.getvalue()


@router.post("/import", response_model=ImportAccountsResponse)
def import_accounts(
    request: ImportAccountsRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 将批量导入的邮箱账号写入当前用户可管理的用户池。"""
    current_user = require_admin_authorization(authorization)
    if current_user.role == USER_ROLE_ADMIN:
        if request.owner_user_id is None:
            raise HTTPException(status_code=400, detail="导入时必须指定归属用户")
        owner = _ensure_transfer_target(session, request.owner_user_id)
    else:
        if request.owner_user_id is not None and request.owner_user_id != current_user.id:
            raise HTTPException(status_code=403, detail="普通用户只能导入到自己的用户池")
        owner = current_user

    items: list[ImportResultItem] = []
    errors: list[str] = []
    created = 0
    updated = 0

    for index, raw_line in enumerate(request.data.splitlines(), start=1):
        parsed = _parse_import_line(raw_line)
        if not parsed:
            if raw_line.strip():
                errors.append(f"第 {index} 行格式无效")
            continue
        email, password, client_id, refresh_token = parsed
        existing = session.exec(select(OutlookAccount).where(OutlookAccount.email == email)).first()
        now = utcnow()
        if existing:
            existing.password = password
            existing.client_id = client_id
            existing.refresh_token = refresh_token
            existing.enabled = request.enabled
            existing.batch_code = request.batch_code
            existing.owner_user_id = owner.id
            existing.updated_at = now
            session.add(existing)
            updated += 1
            items.append(ImportResultItem(email=email, action="updated", id=existing.id))
            continue
        account = OutlookAccount(
            owner_user_id=owner.id,
            email=email,
            password=password,
            client_id=client_id,
            refresh_token=refresh_token,
            enabled=request.enabled,
            batch_code=request.batch_code,
            created_at=now,
            updated_at=now,
        )
        session.add(account)
        session.flush()
        created += 1
        items.append(ImportResultItem(email=email, action="created", id=account.id))

    if created or updated:
        owner.last_imported_at = utcnow()
        owner.updated_at = utcnow()
        session.add(owner)

    session.commit()
    return ImportAccountsResponse(
        total=len(items) + len(errors),
        created=created,
        updated=updated,
        failed=len(errors),
        items=items,
        errors=errors,
    )


@router.get("", response_model=AccountListResponse)
def list_accounts(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    keyword: str = Query(default=""),
    user_id: int | None = Query(default=None),
    scope: str = Query(default="consumed"),
    batch_code: str = Query(default=""),
    site_code: str = Query(default=""),
):
    """AI by zb: 按当前用户身份返回池内或已使用邮箱列表。"""
    current_user = require_admin_authorization(authorization)
    visible_items = _collect_visible_accounts(session, current_user, keyword, user_id, scope, batch_code, site_code)
    total = len(visible_items)
    total_pages = max(1, ceil(total / page_size)) if total else 1
    start = (page - 1) * page_size
    paged_items = visible_items[start : start + page_size]
    return AccountListResponse(items=paged_items, total=total, page=page, page_size=page_size, total_pages=total_pages)


@router.get("/export")
def export_accounts(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
    keyword: str = Query(default=""),
    user_id: int | None = Query(default=None),
    scope: str = Query(default="all"),
    batch_code: str = Query(default=""),
    site_code: str = Query(default=""),
):
    """AI by zb: 导出指定用户范围内的邮箱 CSV。"""
    current_user = require_admin_authorization(authorization)
    visible_items = _collect_visible_accounts(session, current_user, keyword, user_id, scope, batch_code, site_code)
    csv_content = _build_export_csv(visible_items)
    filename_parts = ["accounts"]
    if user_id is not None:
        filename_parts.append(f"user-{user_id}")
    filename_parts.append(scope if scope in {"consumed", "pool", "all"} else "all")
    if batch_code.strip():
        filename_parts.append(batch_code.strip())
    filename = "-".join(filename_parts) + ".csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(iter([csv_content.encode("utf-8")]), media_type="text/csv; charset=utf-8", headers=headers)


@router.post("/batch-move", response_model=OperationStatusResponse)
def batch_move_accounts(
    request: BatchMoveAccountsRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 将指定邮箱批量转移到新的用户池。"""
    require_admin_user(authorization)
    owner = _ensure_transfer_target(session, request.owner_user_id)
    accounts = session.exec(select(OutlookAccount).where(OutlookAccount.id.in_(request.account_ids))).all()
    if len(accounts) != len(set(request.account_ids)):
        raise HTTPException(status_code=404, detail="部分邮箱不存在，无法完成批量转移")

    now = utcnow()
    for account in accounts:
        release_all_account_site_usages(session, account.id or 0)
        account.owner_user_id = owner.id
        account.updated_at = now
        account.is_pinned = False
        account.pinned_at = None
        session.add(account)
    session.commit()
    return OperationStatusResponse(ok=True, email="", message=f"已转移 {len(accounts)} 个邮箱到 {owner.username}")


@router.post("/random-consume", response_model=RandomConsumeAccountResponse)
def random_consume_account(
    request: RandomConsumeAccountRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 从当前站点对应的账号池中随机使用一个邮箱，并返回其在已消费视图中的分页位置。"""
    current_user = require_admin_authorization(authorization)
    pool_items = _collect_visible_accounts(
        session,
        current_user,
        keyword="",
        user_id=request.owner_user_id,
        scope="pool",
        batch_code="",
        site_code=request.site_code,
    )
    if not pool_items:
        raise HTTPException(status_code=404, detail="当前站点下没有可随机使用的账号池邮箱")

    picked = random.SystemRandom().choice(pool_items)
    account = _get_account_or_404(session, picked.id)
    site = get_site_by_code(session, request.site_code, enabled_only=True)
    if get_active_account_site_usage(session, account.id or 0, site.id or 0):
        raise HTTPException(status_code=400, detail=f"该邮箱已被站点 {site.name or site.code} 使用")
    if account.owner_user_id is None:
        raise HTTPException(status_code=400, detail="该邮箱尚未归属任何用户池，无法随机使用")

    now = utcnow()
    session.add(
        AccountSiteUsage(
            account_id=account.id or 0,
            site_id=site.id or 0,
            user_id=account.owner_user_id,
            source=SITE_SOURCE_MANUAL,
            created_at=now,
            updated_at=now,
        )
    )
    account.updated_at = now
    session.add(account)
    session.commit()

    consumed_items = _collect_visible_accounts(
        session,
        current_user,
        keyword="",
        user_id=request.owner_user_id,
        scope="consumed",
        batch_code="",
        site_code=request.site_code,
    )
    consumed_index = next((idx for idx, item in enumerate(consumed_items) if item.id == picked.id), 0)
    page = consumed_index // request.page_size + 1
    consumed_item = consumed_items[consumed_index]
    return RandomConsumeAccountResponse(item=consumed_item, page=page)


@router.get("/pool-summary", response_model=PoolSummaryResponse)
def pool_summary(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
    user_id: int | None = Query(default=None),
    site_code: str = Query(default=""),
):
    """AI by zb: 返回指定用户或全部用户的池内与已使用数量概览。"""
    current_user = require_admin_authorization(authorization)
    current_site = get_site_by_code(session, site_code, enabled_only=True) if site_code.strip() else None
    if current_user.role == USER_ROLE_ADMIN and user_id is None:
        pool_count, consumed_count = count_pool_and_consumed_accounts(session, site_id=current_site.id if current_site else None)
        return PoolSummaryResponse(
            user={"id": 0, "username": current_site.name if current_site else "全部用户", "role": "summary"},
            pool_count=pool_count,
            consumed_count=consumed_count,
        )

    target_user = current_user if current_user.role != USER_ROLE_ADMIN or user_id is None else _get_user_or_404(session, user_id)
    if target_user.role == USER_ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="管理员不存在邮箱池")
    pool_count, consumed_count = count_pool_and_consumed_accounts(session, target_user.id, site_id=current_site.id if current_site else None)
    return PoolSummaryResponse(
        user={"id": target_user.id or 0, "username": target_user.username, "role": target_user.role},
        pool_count=pool_count,
        consumed_count=consumed_count,
    )


@router.get("/{account_id}", response_model=AccountDetailResponse)
def get_account(
    account_id: int,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 获取指定邮箱详情，并按角色校验查看权限。"""
    current_user = require_admin_authorization(authorization)
    owner_map = _load_owner_map(session)
    site_map = load_site_map(session)
    account = _get_account_or_404(session, account_id)
    _ensure_account_visible(current_user, account)
    return _serialize_detail(session, account, owner_map, site_map)


@router.patch("/{account_id}", response_model=AccountDetailResponse)
def update_account(
    account_id: int,
    request: UpdateAccountRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 更新指定邮箱的置顶、备注、启停与归属信息。"""
    current_user = require_admin_authorization(authorization)
    owner_map = _load_owner_map(session)
    site_map = load_site_map(session)
    account = _get_account_or_404(session, account_id)
    _ensure_account_visible(current_user, account)
    _ensure_account_manageable(current_user, account)

    now = utcnow()

    if request.owner_user_id is not None:
        if current_user.role != USER_ROLE_ADMIN:
            raise HTTPException(status_code=403, detail="仅管理员可调整邮箱归属")
        owner = _ensure_transfer_target(session, request.owner_user_id)
        release_all_account_site_usages(session, account.id or 0)
        account.owner_user_id = owner.id
        account.is_pinned = False
        account.pinned_at = None

    if request.note is not None:
        account.note = request.note.strip()

    if request.enabled is not None:
        account.enabled = request.enabled
        if not request.enabled:
            release_all_account_site_usages(session, account.id or 0)
            shares = session.exec(select(ShareToken).where(ShareToken.account_id == account.id)).all()
            for share in shares:
                session.delete(share)
            account.is_pinned = False
            account.pinned_at = None

    if request.is_pinned is not None:
        account.is_pinned = bool(request.is_pinned and account.enabled)
        account.pinned_at = now if account.is_pinned else None

    account.updated_at = now
    session.add(account)
    session.commit()
    session.refresh(account)
    return _serialize_detail(session, account, owner_map, site_map)


@router.post("/{account_id}/consume", response_model=OperationStatusResponse)
def consume_account(
    account_id: int,
    request: ManualConsumeAccountRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 手动将指定邮箱标记为某个站点已使用。"""
    current_user = require_admin_authorization(authorization)
    account = _get_account_or_404(session, account_id)
    _ensure_account_visible(current_user, account)
    _ensure_account_manageable(current_user, account)

    if not account.enabled:
        raise HTTPException(status_code=400, detail="该邮箱已不可用，无法继续使用")
    if account.owner_user_id is None:
        raise HTTPException(status_code=400, detail="该邮箱尚未归属任何用户池，无法手动使用")

    site = get_site_by_code(session, request.site_code, enabled_only=True)
    existing_usage = get_active_account_site_usage(session, account.id or 0, site.id or 0)
    if existing_usage:
        raise HTTPException(status_code=400, detail=f"该邮箱已被站点 {site.name or site.code} 使用")

    now = utcnow()
    usage = AccountSiteUsage(
        account_id=account.id or 0,
        site_id=site.id or 0,
        user_id=account.owner_user_id,
        source=SITE_SOURCE_MANUAL,
        created_at=now,
        updated_at=now,
    )
    account.updated_at = now
    session.add(usage)
    session.add(account)
    session.commit()
    return OperationStatusResponse(ok=True, email=account.email, message=f"已标记为站点 {site.name or site.code} 使用")


@router.post("/{account_id}/release", response_model=OperationStatusResponse)
def release_account(
    account_id: int,
    request: ReleaseAccountUsageRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 退回指定邮箱在某个站点上的使用记录。"""
    current_user = require_admin_authorization(authorization)
    account = _get_account_or_404(session, account_id)
    _ensure_account_visible(current_user, account)
    _ensure_account_manageable(current_user, account)

    site = get_site_by_code(session, request.site_code, enabled_only=False)
    usage = get_active_account_site_usage(session, account.id or 0, site.id or 0)
    if not usage:
        raise HTTPException(status_code=400, detail=f"该邮箱当前未被站点 {site.name or site.code} 使用")

    release_site_usage(session, usage)
    account.updated_at = utcnow()
    session.add(account)
    session.commit()
    return OperationStatusResponse(ok=True, email=account.email, message=f"邮箱已从站点 {site.name or site.code} 退回")


@router.delete("/{account_id}", response_model=OperationStatusResponse)
def delete_account(
    account_id: int,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 软删除指定邮箱，使其对整站不可见。"""
    current_user = require_admin_authorization(authorization)
    account = _get_account_or_404(session, account_id)
    _ensure_account_visible(current_user, account)
    _ensure_account_manageable(current_user, account)

    release_all_account_site_usages(session, account.id or 0)
    shares = session.exec(select(ShareToken).where(ShareToken.account_id == account.id)).all()
    for share in shares:
        session.delete(share)
    account.enabled = False
    account.is_pinned = False
    account.pinned_at = None
    account.updated_at = utcnow()
    session.add(account)
    session.commit()
    return OperationStatusResponse(ok=True, email=account.email, message="邮箱已软删除并从整站隐藏")
