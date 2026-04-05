"""Pydantic schemas for Outlook Mail Station."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ImportAccountsRequest(BaseModel):
    """AI by zb: 定义 Outlook 批量导入接口的请求体。"""

    data: str
    enabled: bool = True
    batch_code: str = ""


class ImportResultItem(BaseModel):
    """AI by zb: 描述单条导入记录的处理结果。"""

    email: str
    action: str
    id: Optional[int] = None


class ImportAccountsResponse(BaseModel):
    """AI by zb: 描述批量导入后的聚合结果。"""

    total: int
    created: int
    updated: int
    failed: int
    items: list[ImportResultItem]
    errors: list[str]


class AccountListItem(BaseModel):
    """AI by zb: 描述前端左侧邮箱列表使用的账号结构。"""

    id: int
    email: str
    enabled: bool
    is_pinned: bool = False
    batch_code: str = ""
    note: str
    created_at: datetime
    updated_at: datetime
    last_synced_at: Optional[datetime] = None
    last_error: str = ""
    inbox_count: int = 0
    sent_count: int = 0


class AccountListResponse(BaseModel):
    """AI by zb: 描述左侧邮箱列表的分页结果。"""

    items: list[AccountListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class AccountDetailResponse(BaseModel):
    """AI by zb: 描述右侧当前邮箱卡片所需的账号详情。"""

    id: int
    email: str
    enabled: bool
    is_pinned: bool = False
    batch_code: str = ""
    note: str
    last_synced_at: Optional[datetime] = None
    last_error: str = ""
    inbox_count: int = 0
    sent_count: int = 0
    has_password: bool = False
    has_oauth: bool = False


class UpdateAccountRequest(BaseModel):
    """AI by zb: 定义账号启停与备注修改的请求体。"""

    enabled: Optional[bool] = None
    note: Optional[str] = None
    is_pinned: Optional[bool] = None


class MessageItemResponse(BaseModel):
    """AI by zb: 描述邮件列表项。"""

    id: int
    folder: str
    subject: str
    sender_name: str
    sender_email: str
    recipient_summary: str
    preview: str
    sent_at: Optional[datetime] = None


class MessageDetailResponse(MessageItemResponse):
    """AI by zb: 描述邮件详情。"""

    body_text: str
    body_html: str


class SyncResponse(BaseModel):
    """AI by zb: 描述手动刷新邮箱后的结果。"""

    account_id: int
    synced_at: datetime
    inbox_count: int
    sent_count: int


class SendMailRequest(BaseModel):
    """AI by zb: 定义发件请求结构。"""

    to: str = Field(min_length=1)
    cc: str = ""
    bcc: str = ""
    subject: str = Field(min_length=1)
    body_text: str = ""
    body_html: str = ""


class ShareCreateRequest(BaseModel):
    """AI by zb: 定义临时授权链接创建请求。"""

    days: int = Field(default=30, ge=1, le=365)


class ShareCreateResponse(BaseModel):
    """AI by zb: 描述临时授权链接创建结果。"""

    token: str
    url: str
    expires_at: datetime


class PublicShareResponse(BaseModel):
    """AI by zb: 描述公开访问页使用的只读数据。"""

    account: AccountDetailResponse
    inbox: list[MessageItemResponse]
    sent: list[MessageItemResponse]
    expires_at: datetime


class HealthResponse(BaseModel):
    """AI by zb: 描述后端健康检查结果。"""

    ok: bool
    app: str


class AdminAuthStatusResponse(BaseModel):
    """AI by zb: 描述管理员登录开关与当前登录状态。"""

    enabled: bool
    authenticated: bool


class AdminLoginRequest(BaseModel):
    """AI by zb: 定义管理员登录请求。"""

    password: str


class AdminLoginResponse(BaseModel):
    """AI by zb: 描述管理员登录成功后的返回值。"""

    access_token: str
    token_type: str = "bearer"


class RandomMailboxRequest(BaseModel):
    """AI by zb: 定义随机取邮箱请求。"""

    domain: str = ""
    batch_code: str = ""
    lease_seconds: int = Field(default=1800, ge=60, le=86400)


class RandomMailboxResponse(BaseModel):
    """AI by zb: 描述随机返回的邮箱信息。"""

    id: int
    email: str
    domain: str
    batch_code: str = ""
    lease_expires_at: Optional[datetime] = None


class OpenMailboxLatestResponse(BaseModel):
    """AI by zb: 描述指定邮箱最后一封收件邮件。"""

    account_id: int
    email: str
    message: Optional[MessageDetailResponse] = None


class OpenMailboxListResponse(BaseModel):
    """AI by zb: 描述指定邮箱的邮件列表返回。"""

    account_id: int
    email: str
    count: int
    items: list[MessageItemResponse]


class OperationStatusResponse(BaseModel):
    """AI by zb: 描述通用操作型接口的成功结果。"""

    ok: bool
    email: str
    message: str
