"""Site management routes for Outlook Mail Station."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlmodel import Session, select

from ..auth import require_admin_authorization, require_admin_user
from ..database import get_session
from ..models import Site, utcnow
from ..schemas import SiteCreateRequest, SiteItemResponse, SiteListResponse, SiteUpdateRequest
from ..services.site_usage_service import normalize_site_code


router = APIRouter(prefix="/sites", tags=["sites"])


def _serialize_site(site: Site) -> SiteItemResponse:
    """AI by zb: 序列化站点列表项。"""
    return SiteItemResponse(
        id=site.id or 0,
        code=site.code,
        name=site.name,
        enabled=site.enabled,
        created_at=site.created_at,
        updated_at=site.updated_at,
    )


def _get_site_or_404(session: Session, site_id: int) -> Site:
    """AI by zb: 获取站点实体，不存在时抛出 404。"""
    site = session.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="站点不存在")
    return site


def _ensure_site_code_available(session: Session, site_code: str, ignored_site_id: int | None = None) -> str:
    """AI by zb: 校验站点编码唯一性，并统一转为大写。"""
    normalized_code = normalize_site_code(site_code)
    if not normalized_code:
        raise HTTPException(status_code=400, detail="站点编码不能为空")
    existing = session.exec(select(Site).where(Site.code == normalized_code)).first()
    if existing and existing.id != ignored_site_id:
        raise HTTPException(status_code=400, detail="站点编码已存在")
    return normalized_code


@router.get("", response_model=SiteListResponse)
def list_sites(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 返回站点列表，管理员可见全部，普通用户仅看启用站点。"""
    current_user = require_admin_authorization(authorization)
    stmt = select(Site).order_by(Site.enabled.desc(), Site.created_at.asc(), Site.id.asc())
    if current_user.role != "admin":
        stmt = stmt.where(Site.enabled == True)
    items = session.exec(stmt).all()
    return SiteListResponse(items=[_serialize_site(site) for site in items])


@router.post("", response_model=SiteItemResponse)
def create_site(
    request: SiteCreateRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 创建新的站点配置。"""
    require_admin_user(authorization)
    normalized_code = _ensure_site_code_available(session, request.code)
    now = utcnow()
    site = Site(
        code=normalized_code,
        name=request.name.strip(),
        enabled=request.enabled,
        created_at=now,
        updated_at=now,
    )
    session.add(site)
    session.commit()
    session.refresh(site)
    return _serialize_site(site)


@router.patch("/{site_id}", response_model=SiteItemResponse)
def update_site(
    site_id: int,
    request: SiteUpdateRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 更新站点编码、名称与启停状态。"""
    require_admin_user(authorization)
    site = _get_site_or_404(session, site_id)

    if request.code is not None:
        site.code = _ensure_site_code_available(session, request.code, ignored_site_id=site.id)
    if request.name is not None:
        site.name = request.name.strip()
    if request.enabled is not None:
        site.enabled = request.enabled
    site.updated_at = utcnow()
    session.add(site)
    session.commit()
    session.refresh(site)
    return _serialize_site(site)
