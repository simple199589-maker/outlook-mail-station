"""Authentication helpers for admin UI and open API."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Optional

from fastapi import Header, HTTPException
from sqlmodel import Session, select

from .database import engine
from .models import StationUser, USER_ROLE_ADMIN
from .settings import ADMIN_JWT_SECRET, ADMIN_PASSWORD, APP_NAME


def _jwt_secret() -> str:
    """AI by zb: 返回后台用户 JWT 使用的签名密钥。"""
    secret = str(ADMIN_JWT_SECRET or "").strip()
    if secret:
        return secret
    return hashlib.sha256(f"{APP_NAME}:{ADMIN_PASSWORD}".encode("utf-8")).hexdigest()


def admin_auth_enabled() -> bool:
    """AI by zb: 判断当前是否启用了后台登录保护。"""
    return bool(str(ADMIN_PASSWORD or "").strip())


def _b64url_encode(data: bytes) -> str:
    """AI by zb: 生成 JWT 所需的 base64url 编码。"""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64url_decode(text: str) -> bytes:
    """AI by zb: 解码 JWT 中的 base64url 字段。"""
    padding = 4 - len(text) % 4
    if padding != 4:
        text += "=" * padding
    return base64.urlsafe_b64decode(text)


def _build_identity(user: StationUser) -> dict:
    """AI by zb: 提取登录用户的最小身份信息。"""
    return {
        "id": user.id or 0,
        "username": user.username,
        "role": user.role,
    }


def create_admin_token(user: StationUser, expire_seconds: int = 86400 * 7) -> str:
    """AI by zb: 为后台用户创建登录后的会话令牌。"""
    now = int(time.time())
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    payload = _b64url_encode(
        json.dumps(
            {
                "sub": user.username,
                "uid": user.id,
                "role": user.role,
                "iat": now,
                "exp": now + expire_seconds,
            }
        ).encode("utf-8")
    )
    signature = _b64url_encode(
        hmac.new(_jwt_secret().encode("utf-8"), f"{header}.{payload}".encode("utf-8"), hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{signature}"


def verify_admin_token(token: str) -> dict:
    """AI by zb: 校验后台用户 JWT 并返回其载荷。"""
    try:
        header, payload, signature = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="登录令牌格式无效") from exc

    expected = _b64url_encode(
        hmac.new(_jwt_secret().encode("utf-8"), f"{header}.{payload}".encode("utf-8"), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="登录令牌签名无效")

    try:
        data = json.loads(_b64url_decode(payload))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="登录令牌内容无效") from exc

    if int(data.get("exp", 0) or 0) < int(time.time()):
        raise HTTPException(status_code=401, detail="登录令牌已过期")
    return data


def get_current_user(authorization: Optional[str]) -> StationUser:
    """AI by zb: 根据 Authorization 头解析当前登录用户。"""
    if not admin_auth_enabled():
        raise HTTPException(status_code=503, detail="后台登录未启用")
    token = str(authorization or "").strip()
    if not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录后台账号")
    payload = verify_admin_token(token[7:].strip())
    user_id = int(payload.get("uid") or 0)
    with Session(engine) as session:
        user = session.get(StationUser, user_id)
        if not user or not user.enabled:
            raise HTTPException(status_code=401, detail="登录账号不存在或已禁用")
        return user


def require_admin_authorization(authorization: Optional[str]) -> StationUser:
    """AI by zb: 校验后台接口 Authorization 头并返回当前用户。"""
    return get_current_user(authorization)


def require_admin_user(authorization: Optional[str]) -> StationUser:
    """AI by zb: 校验当前登录用户必须为总管理员。"""
    user = get_current_user(authorization)
    if user.role != USER_ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="仅管理员可执行该操作")
    return user


def authenticate_user(username: str, password: str) -> StationUser:
    """AI by zb: 校验用户名密码并返回登录用户。"""
    normalized = str(username or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    with Session(engine) as session:
        user = session.exec(select(StationUser).where(StationUser.username == normalized)).first()
        if not user or not user.enabled:
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        if not hmac.compare_digest(str(user.password or ""), str(password or "")):
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        return user


def require_open_api_user(
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None),
) -> StationUser:
    """AI by zb: 校验用户级开放接口 API Key 并返回其绑定的普通用户。"""
    sent_key = str(x_api_key or "").strip()
    token = str(authorization or "").strip()
    candidate = sent_key or (token[7:].strip() if token.startswith("Bearer ") else "")
    if not candidate:
        raise HTTPException(status_code=401, detail="未提供开放接口 API Key")

    with Session(engine) as session:
        user = session.exec(select(StationUser).where(StationUser.api_key == candidate)).first()
        if not user or not user.enabled or user.role == USER_ROLE_ADMIN:
            raise HTTPException(status_code=401, detail="开放接口认证失败")
        return user


def build_user_identity(user: StationUser) -> dict:
    """AI by zb: 对外返回可序列化的用户身份信息。"""
    return _build_identity(user)
