"""Admin authentication routes for Outlook Mail Station."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException

from ..auth import (
    admin_auth_enabled,
    authenticate_user,
    build_user_identity,
    create_admin_token,
    require_admin_authorization,
)
from ..schemas import AdminAuthStatusResponse, AdminLoginRequest, AdminLoginResponse


router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


@router.get("/status", response_model=AdminAuthStatusResponse)
def auth_status(authorization: str | None = Header(default=None)):
    """AI by zb: 返回后台登录开关和当前会话是否有效。"""
    authenticated = False
    user = None
    try:
        current_user = require_admin_authorization(authorization)
        authenticated = True
        user = build_user_identity(current_user)
    except HTTPException:
        authenticated = False
    return AdminAuthStatusResponse(enabled=admin_auth_enabled(), authenticated=authenticated, user=user)


@router.post("/login", response_model=AdminLoginResponse)
def login(request: AdminLoginRequest):
    """AI by zb: 使用后台用户名密码进行登录。"""
    if not admin_auth_enabled():
        raise HTTPException(status_code=503, detail="后台登录未启用")
    user = authenticate_user(request.username, request.password)
    return AdminLoginResponse(access_token=create_admin_token(user), user=build_user_identity(user))
