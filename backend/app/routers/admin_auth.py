"""Admin authentication routes for Outlook Mail Station."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, HTTPException

from ..auth import admin_auth_enabled, create_admin_token, require_admin_authorization
from ..schemas import AdminAuthStatusResponse, AdminLoginRequest, AdminLoginResponse
from ..settings import ADMIN_PASSWORD


router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


@router.get("/status", response_model=AdminAuthStatusResponse)
def auth_status(authorization: str | None = Header(default=None)):
    """AI by zb: 返回管理员登录开关和当前会话是否有效。"""
    authenticated = False
    try:
        require_admin_authorization(authorization)
        authenticated = True
    except HTTPException:
        authenticated = False
    return AdminAuthStatusResponse(enabled=admin_auth_enabled(), authenticated=authenticated)


@router.post("/login", response_model=AdminLoginResponse)
def login(request: AdminLoginRequest):
    """AI by zb: 使用环境变量密码进行管理员登录。"""
    if not admin_auth_enabled():
        raise HTTPException(status_code=503, detail="管理员密码未配置")
    if not hmac.compare_digest(str(request.password or ""), str(ADMIN_PASSWORD or "")):
        raise HTTPException(status_code=401, detail="管理员密码错误")
    return AdminLoginResponse(access_token=create_admin_token())
