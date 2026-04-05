"""Authentication helpers for admin UI and open API."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Optional

from fastapi import Header, HTTPException

from .settings import ADMIN_JWT_SECRET, ADMIN_PASSWORD, APP_NAME, OPEN_API_BEARER, OPEN_API_KEY


def _jwt_secret() -> str:
    """AI by zb: 返回管理员 JWT 使用的签名密钥。"""
    secret = str(ADMIN_JWT_SECRET or "").strip()
    if secret:
        return secret
    return hashlib.sha256(f"{APP_NAME}:{ADMIN_PASSWORD}".encode("utf-8")).hexdigest()


def admin_auth_enabled() -> bool:
    """AI by zb: 判断当前是否启用了管理员登录保护。"""
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


def create_admin_token(expire_seconds: int = 86400 * 7) -> str:
    """AI by zb: 创建管理员登录后的会话令牌。"""
    now = int(time.time())
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    payload = _b64url_encode(
        json.dumps({"sub": "admin", "iat": now, "exp": now + expire_seconds}).encode("utf-8")
    )
    signature = _b64url_encode(
        hmac.new(_jwt_secret().encode("utf-8"), f"{header}.{payload}".encode("utf-8"), hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{signature}"


def verify_admin_token(token: str) -> dict:
    """AI by zb: 校验管理员 JWT 并返回其载荷。"""
    try:
        header, payload, signature = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="管理员令牌格式无效") from exc

    expected = _b64url_encode(
        hmac.new(_jwt_secret().encode("utf-8"), f"{header}.{payload}".encode("utf-8"), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="管理员令牌签名无效")

    try:
        data = json.loads(_b64url_decode(payload))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="管理员令牌内容无效") from exc

    if int(data.get("exp", 0) or 0) < int(time.time()):
        raise HTTPException(status_code=401, detail="管理员令牌已过期")
    return data


def require_admin_authorization(authorization: Optional[str]) -> None:
    """AI by zb: 校验管理员接口的 Authorization 头。"""
    if not admin_auth_enabled():
        return
    token = str(authorization or "").strip()
    if not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录管理员账号")
    verify_admin_token(token[7:].strip())


def open_api_enabled() -> bool:
    """AI by zb: 判断是否启用了固定密钥式开放接口。"""
    return bool(str(OPEN_API_KEY or "").strip() or str(OPEN_API_BEARER or "").strip())


def require_open_api_auth(
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None),
) -> None:
    """AI by zb: 校验开放接口使用的固定密钥或固定 Bearer。"""
    if not open_api_enabled():
        raise HTTPException(status_code=503, detail="开放接口未启用，请先配置固定密钥")

    sent_key = str(x_api_key or "").strip()
    expected_key = str(OPEN_API_KEY or "").strip()
    if expected_key and sent_key and hmac.compare_digest(sent_key, expected_key):
        return

    token = str(authorization or "").strip()
    expected_bearer = str(OPEN_API_BEARER or "").strip()
    if expected_bearer and token.startswith("Bearer "):
        candidate = token[7:].strip()
        if hmac.compare_digest(candidate, expected_bearer):
            return

    raise HTTPException(status_code=401, detail="开放接口认证失败")
