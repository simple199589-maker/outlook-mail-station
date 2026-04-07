"""User management routes for Outlook Mail Station."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlmodel import Session, select

from ..auth import require_admin_authorization, require_admin_user
from ..database import generate_unique_user_api_key, get_session
from ..models import OutlookAccount, StationUser, USER_ROLE_ADMIN, USER_ROLE_USER, utcnow
from ..schemas import UserApiKeyResponse, UserCreateRequest, UserItemResponse, UserListResponse, UserUpdateRequest
from ..services.site_usage_service import count_pool_and_consumed_accounts


router = APIRouter(prefix="/users", tags=["users"])


def _get_user_or_404(session: Session, user_id: int) -> StationUser:
    """AI by zb: 获取指定后台用户，不存在时抛出 404。"""
    user = session.get(StationUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


def _count_pool_and_consumed(session: Session, user_id: int) -> tuple[int, int]:
    """AI by zb: 汇总指定用户的池内邮箱数量与已消费数量。"""
    return count_pool_and_consumed_accounts(session, user_id)


def _resolve_last_imported_at(session: Session, user: StationUser) -> datetime | None:
    """AI by zb: 返回用户最近一次导入邮箱时间，历史数据按邮箱创建时间兜底。"""
    if user.last_imported_at is not None:
        return user.last_imported_at
    return session.exec(
        select(OutlookAccount.created_at)
        .where(OutlookAccount.owner_user_id == (user.id or 0))
        .order_by(OutlookAccount.created_at.desc())
    ).first()


def _serialize_user(session: Session, user: StationUser) -> UserItemResponse:
    """AI by zb: 序列化用户列表项并附带邮箱池统计。"""
    pool_count, consumed_count = _count_pool_and_consumed(session, user.id or 0)
    return UserItemResponse(
        id=user.id or 0,
        username=user.username,
        role=user.role,
        enabled=user.enabled,
        pool_count=pool_count,
        consumed_count=consumed_count,
        last_imported_at=_resolve_last_imported_at(session, user),
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _ensure_api_key_access(current_user: StationUser, user: StationUser) -> None:
    """AI by zb: 校验当前用户是否有权查看或重置指定用户的 API Key。"""
    if current_user.role == USER_ROLE_ADMIN:
        return
    if current_user.id == user.id:
        return
    raise HTTPException(status_code=403, detail="无权查看该用户的 API Key")


def _ensure_user_api_key(session: Session, user: StationUser) -> StationUser:
    """AI by zb: 确保普通用户存在可用的开放接口 API Key。"""
    if user.role == USER_ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="管理员用户不提供开放接口 API Key")
    if user.api_key:
        return user
    user.api_key = generate_unique_user_api_key(session)
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _serialize_user_api_key(user: StationUser) -> UserApiKeyResponse:
    """AI by zb: 序列化用户级开放接口 API Key 响应。"""
    return UserApiKeyResponse(
        user_id=user.id or 0,
        username=user.username,
        api_key=user.api_key or "",
        updated_at=user.updated_at,
    )


@router.get("", response_model=UserListResponse)
def list_users(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 根据当前角色返回用户列表或当前用户信息。"""
    current_user = require_admin_authorization(authorization)
    if current_user.role != USER_ROLE_ADMIN:
        return UserListResponse(items=[_serialize_user(session, current_user)])
    users = session.exec(select(StationUser).order_by(StationUser.role.asc(), StationUser.created_at.asc())).all()
    return UserListResponse(items=[_serialize_user(session, user) for user in users])


@router.post("", response_model=UserItemResponse)
def create_user(
    request: UserCreateRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 创建普通后台用户，供管理员分配邮箱池。"""
    require_admin_user(authorization)
    username = request.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    existing = session.exec(select(StationUser).where(StationUser.username == username)).first()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")
    role = USER_ROLE_ADMIN if request.role == USER_ROLE_ADMIN else USER_ROLE_USER
    user = StationUser(
        username=username,
        password=request.password,
        role=role,
        api_key=generate_unique_user_api_key(session) if role != USER_ROLE_ADMIN else None,
        enabled=request.enabled,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _serialize_user(session, user)


@router.get("/{user_id}/api-key", response_model=UserApiKeyResponse)
def get_user_api_key(
    user_id: int,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 返回指定普通用户当前可用的开放接口 API Key。"""
    current_user = require_admin_authorization(authorization)
    user = _get_user_or_404(session, user_id)
    _ensure_api_key_access(current_user, user)
    ensured_user = _ensure_user_api_key(session, user)
    return _serialize_user_api_key(ensured_user)


@router.post("/{user_id}/api-key/regenerate", response_model=UserApiKeyResponse)
def regenerate_user_api_key(
    user_id: int,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 重置指定普通用户的开放接口 API Key。"""
    current_user = require_admin_authorization(authorization)
    user = _get_user_or_404(session, user_id)
    _ensure_api_key_access(current_user, user)
    if user.role == USER_ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="管理员用户不提供开放接口 API Key")
    user.api_key = generate_unique_user_api_key(session)
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return _serialize_user_api_key(user)


@router.patch("/{user_id}", response_model=UserItemResponse)
def update_user(
    user_id: int,
    request: UserUpdateRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    """AI by zb: 更新后台用户启停状态与密码。"""
    current_user = require_admin_authorization(authorization)
    user = _get_user_or_404(session, user_id)
    if current_user.role != USER_ROLE_ADMIN and current_user.id != user.id:
        raise HTTPException(status_code=403, detail="无权修改该用户")
    if request.password is not None:
        user.password = request.password
    if request.enabled is not None:
        if user.role == USER_ROLE_ADMIN and request.enabled is False and current_user.id == user.id:
            raise HTTPException(status_code=400, detail="不能禁用当前管理员自己")
        user.enabled = request.enabled
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return _serialize_user(session, user)
