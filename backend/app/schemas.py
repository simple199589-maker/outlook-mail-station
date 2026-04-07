"""Pydantic schemas for Outlook Mail Station."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserIdentityResponse(BaseModel):
    """AI by zb: 描述当前登录用户的最小身份信息。"""

    id: int
    username: str
    role: str


class AdminAuthStatusResponse(BaseModel):
    """AI by zb: 描述后台登录状态检查结果。"""

    enabled: bool
    authenticated: bool
    user: Optional[UserIdentityResponse] = None


class AdminLoginRequest(BaseModel):
    """AI by zb: 定义后台管理员登录请求。"""

    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AdminLoginResponse(BaseModel):
    """AI by zb: 描述后台管理员登录结果。"""

    access_token: str
    token_type: str = "bearer"
    user: UserIdentityResponse


class UserItemResponse(UserIdentityResponse):
    """AI by zb: 描述后台用户列表项。"""

    enabled: bool
    pool_count: int = 0
    consumed_count: int = 0
    last_imported_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class UserListResponse(BaseModel):
    """AI by zb: 描述后台用户分页或列表结果。"""

    items: list[UserItemResponse]


class UserApiKeyResponse(BaseModel):
    """AI by zb: 描述用户级开放接口 API Key 信息。"""

    user_id: int
    username: str
    api_key: str
    updated_at: datetime


class UserCreateRequest(BaseModel):
    """AI by zb: 定义创建后台用户请求。"""

    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    role: str = "user"
    enabled: bool = True


class UserUpdateRequest(BaseModel):
    """AI by zb: 定义更新后台用户请求。"""

    password: Optional[str] = None
    enabled: Optional[bool] = None


class SiteItemResponse(BaseModel):
    """AI by zb: 描述站点列表项。"""

    id: int
    code: str
    name: str
    enabled: bool
    created_at: datetime
    updated_at: datetime


class SiteListResponse(BaseModel):
    """AI by zb: 描述站点列表结果。"""

    items: list[SiteItemResponse]


class SiteCreateRequest(BaseModel):
    """AI by zb: 定义创建站点请求。"""

    code: str = Field(min_length=1)
    name: str = Field(min_length=1)
    enabled: bool = True


class SiteUpdateRequest(BaseModel):
    """AI by zb: 定义更新站点请求。"""

    code: Optional[str] = Field(default=None, min_length=1)
    name: Optional[str] = Field(default=None, min_length=1)
    enabled: Optional[bool] = None


class ImportAccountsRequest(BaseModel):
    """AI by zb: 定义 Outlook 批量导入接口的请求体。"""

    data: str
    enabled: bool = True
    batch_code: str = ""
    owner_user_id: Optional[int] = None


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


class AccountSiteUsageSummary(BaseModel):
    """AI by zb: 描述邮箱当前有效的站点使用记录。"""

    id: int
    site_id: int
    site_code: str
    site_name: str
    source: str
    used_at: datetime


class AccountListItem(BaseModel):
    """AI by zb: 描述前端左侧邮箱列表使用的账号结构。"""

    id: int
    email: str
    enabled: bool
    is_pinned: bool = False
    batch_code: str = ""
    note: str
    owner_user_id: Optional[int] = None
    owner_username: str = ""
    is_consumed: bool = False
    created_at: datetime
    updated_at: datetime
    last_synced_at: Optional[datetime] = None
    last_error: str = ""
    inbox_count: int = 0
    sent_count: int = 0
    active_sites: list[AccountSiteUsageSummary] = []


class AccountListResponse(BaseModel):
    """AI by zb: 描述左侧邮箱列表的分页结果。"""

    items: list[AccountListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class PoolSummaryResponse(BaseModel):
    """AI by zb: 描述指定用户邮箱池概览。"""

    user: UserIdentityResponse
    pool_count: int
    consumed_count: int


class AccountDetailResponse(BaseModel):
    """AI by zb: 描述右侧当前邮箱卡片所需的账号详情。"""

    id: int
    email: str
    enabled: bool
    is_pinned: bool = False
    batch_code: str = ""
    note: str
    owner_user_id: Optional[int] = None
    owner_username: str = ""
    is_consumed: bool = False
    last_synced_at: Optional[datetime] = None
    last_error: str = ""
    inbox_count: int = 0
    sent_count: int = 0
    active_sites: list[AccountSiteUsageSummary] = []
    has_password: bool = False
    has_oauth: bool = False


class UpdateAccountRequest(BaseModel):
    """AI by zb: 定义账号启停、备注与归属修改的请求体。"""

    enabled: Optional[bool] = None
    note: Optional[str] = None
    is_pinned: Optional[bool] = None
    owner_user_id: Optional[int] = None


class ManualConsumeAccountRequest(BaseModel):
    """AI by zb: 定义后台手动使用指定邮箱的请求体。"""

    site_code: str = Field(min_length=1)


class ReleaseAccountUsageRequest(BaseModel):
    """AI by zb: 定义后台退回指定站点使用记录的请求体。"""

    site_code: str = Field(min_length=1)


class BatchMoveAccountsRequest(BaseModel):
    """AI by zb: 定义批量转移邮箱归属用户的请求体。"""

    account_ids: list[int] = Field(min_length=1)
    owner_user_id: int


class RandomConsumeAccountRequest(BaseModel):
    """AI by zb: 定义工作台随机使用池内邮箱请求。"""

    site_code: str = Field(min_length=1)
    owner_user_id: Optional[int] = None
    page_size: int = Field(default=5, ge=1, le=200)


class RandomConsumeAccountResponse(BaseModel):
    """AI by zb: 描述工作台随机使用后的邮箱及其在已消费视图中的分页。"""

    item: AccountListItem
    page: int


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


class RandomMailboxRequest(BaseModel):
    """AI by zb: 定义开放接口随机领取邮箱请求。"""

    site_code: str = Field(min_length=1)
    batch_code: str = ""
    domain: str = ""


class RandomMailboxResponse(BaseModel):
    """AI by zb: 描述开放接口随机领取邮箱结果。"""

    id: int
    email: str
    domain: str
    site_code: str
    site_name: str
    batch_code: str = ""


class OpenMailboxLatestResponse(BaseModel):
    """AI by zb: 描述开放接口获取最新邮件结果。"""

    account_id: int
    email: str
    message: Optional[MessageDetailResponse] = None


class OpenMailboxListResponse(BaseModel):
    """AI by zb: 描述开放接口邮件列表结果。"""

    account_id: int
    email: str
    count: int
    items: list[MessageItemResponse]


class OperationStatusResponse(BaseModel):
    """AI by zb: 描述开放接口或批量操作的统一结果。"""

    ok: bool
    message: str
    email: str = ""


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
