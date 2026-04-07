"""Site usage helpers for account pool management."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from ..models import AccountSiteUsage, OutlookAccount, Site, utcnow


def normalize_site_code(code: str | None) -> str:
    """AI by zb: 统一规范站点编码格式。"""
    return str(code or "").strip().upper()


def get_active_account_site_usages(session: Session, account_id: int) -> list[AccountSiteUsage]:
    """AI by zb: 返回指定邮箱当前仍生效的站点使用记录。"""
    usages = session.exec(
        select(AccountSiteUsage)
        .where(AccountSiteUsage.account_id == account_id)
        .where(AccountSiteUsage.released_at.is_(None))
        .order_by(AccountSiteUsage.created_at.asc(), AccountSiteUsage.id.asc())
    ).all()
    return list(usages)


def get_active_account_site_usage(session: Session, account_id: int, site_id: int) -> AccountSiteUsage | None:
    """AI by zb: 返回指定邮箱在某个站点上的有效使用记录。"""
    return session.exec(
        select(AccountSiteUsage)
        .where(AccountSiteUsage.account_id == account_id)
        .where(AccountSiteUsage.site_id == site_id)
        .where(AccountSiteUsage.released_at.is_(None))
        .order_by(AccountSiteUsage.created_at.desc(), AccountSiteUsage.id.desc())
    ).first()


def release_site_usage(session: Session, usage: AccountSiteUsage) -> None:
    """AI by zb: 将单条站点使用记录标记为已释放。"""
    now = utcnow()
    usage.released_at = now
    usage.updated_at = now
    session.add(usage)


def release_all_account_site_usages(session: Session, account_id: int) -> None:
    """AI by zb: 释放指定邮箱的全部有效站点使用记录。"""
    for usage in get_active_account_site_usages(session, account_id):
        release_site_usage(session, usage)


def get_site_by_code(session: Session, site_code: str, enabled_only: bool = True) -> Site:
    """AI by zb: 按站点编码查找站点，不存在时抛出异常。"""
    normalized_code = normalize_site_code(site_code)
    if not normalized_code:
        raise HTTPException(status_code=400, detail="站点编码不能为空")
    stmt = select(Site).where(Site.code == normalized_code)
    if enabled_only:
        stmt = stmt.where(Site.enabled == True)
    site = session.exec(stmt).first()
    if not site:
        raise HTTPException(status_code=404, detail="站点不存在或已停用")
    return site


def load_site_map(session: Session) -> dict[int, Site]:
    """AI by zb: 加载站点 ID 到站点实体的映射。"""
    return {
        site.id or 0: site
        for site in session.exec(select(Site)).all()
        if site.id is not None
    }


def count_pool_and_consumed_accounts(
    session: Session,
    owner_user_id: int | None = None,
    *,
    site_id: int | None = None,
) -> tuple[int, int]:
    """AI by zb: 统计指定用户或全部用户在某个站点下的池内与已使用邮箱数量。"""
    stmt = select(OutlookAccount).where(OutlookAccount.enabled == True)
    if owner_user_id is not None:
        stmt = stmt.where(OutlookAccount.owner_user_id == owner_user_id)
    accounts = list(session.exec(stmt).all())
    if not accounts:
        return 0, 0
    usage_stmt = select(AccountSiteUsage).where(AccountSiteUsage.released_at.is_(None))
    if site_id is not None:
      usage_stmt = usage_stmt.where(AccountSiteUsage.site_id == site_id)
    active_usage_account_ids = {usage.account_id for usage in session.exec(usage_stmt).all()}
    consumed_count = sum(1 for account in accounts if (account.id or 0) in active_usage_account_ids)
    pool_count = max(len(accounts) - consumed_count, 0)
    return pool_count, consumed_count
