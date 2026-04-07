/**
 * AI by zb: 描述登录用户信息。
 */
export interface UserIdentity {
  id: number
  username: string
  role: 'admin' | 'user' | string
}

/**
 * AI by zb: 描述后台用户列表项。
 */
export interface UserItem extends UserIdentity {
  enabled: boolean
  pool_count: number
  consumed_count: number
  last_imported_at: string | null
  created_at: string
  updated_at: string
}

/**
 * AI by zb: 描述后台用户列表结果。
 */
export interface UserListResponse {
  items: UserItem[]
}

/**
 * AI by zb: 描述站点配置项。
 */
export interface SiteItem {
  id: number
  code: string
  name: string
  enabled: boolean
  created_at: string
  updated_at: string
}

/**
 * AI by zb: 描述站点列表结果。
 */
export interface SiteListResponse {
  items: SiteItem[]
}

/**
 * AI by zb: 描述用户级开放接口 API Key。
 */
export interface UserApiKeyPayload {
  user_id: number
  username: string
  api_key: string
  updated_at: string
}

/**
 * AI by zb: 描述邮箱列表项。
 */
export interface AccountItem {
  id: number
  email: string
  enabled: boolean
  is_pinned: boolean
  batch_code: string
  note: string
  owner_user_id: number | null
  owner_username: string
  is_consumed: boolean
  created_at: string
  updated_at: string
  last_synced_at: string | null
  last_error: string
  inbox_count: number
  sent_count: number
  active_sites: AccountSiteUsageItem[]
}

/**
 * AI by zb: 描述邮箱当前的站点使用记录。
 */
export interface AccountSiteUsageItem {
  id: number
  site_id: number
  site_code: string
  site_name: string
  source: string
  used_at: string
}

/**
 * AI by zb: 描述邮箱列表分页结果。
 */
export interface AccountListResponse {
  items: AccountItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/**
 * AI by zb: 描述工作台随机抽中的邮箱和目标分页。
 */
export interface RandomConsumeAccountResponse {
  item: AccountItem
  page: number
}

/**
 * AI by zb: 描述当前邮箱详情。
 */
export interface AccountDetail extends AccountItem {
  has_password: boolean
  has_oauth: boolean
}

/**
 * AI by zb: 描述用户池概览。
 */
export interface PoolSummary {
  user: UserIdentity
  pool_count: number
  consumed_count: number
}

/**
 * AI by zb: 描述邮件列表项。
 */
export interface MessageItem {
  id: number
  folder: 'inbox' | 'sent' | string
  subject: string
  sender_name: string
  sender_email: string
  recipient_summary: string
  preview: string
  sent_at: string | null
}

/**
 * AI by zb: 描述邮件详情。
 */
export interface MessageDetail extends MessageItem {
  body_text: string
  body_html: string
}

/**
 * AI by zb: 描述导入结果。
 */
export interface ImportResult {
  total: number
  created: number
  updated: number
  failed: number
  errors: string[]
}

/**
 * AI by zb: 描述临时授权结果。
 */
export interface ShareResult {
  token: string
  url: string
  expires_at: string
}

/**
 * AI by zb: 描述公开分享页数据。
 */
export interface PublicSharePayload {
  account: AccountDetail
  inbox: MessageItem[]
  sent: MessageItem[]
  expires_at: string
}

/**
 * AI by zb: 描述登录状态接口返回。
 */
export interface AuthStatusResponse {
  enabled: boolean
  authenticated: boolean
  user: UserIdentity | null
}

/**
 * AI by zb: 描述登录接口返回。
 */
export interface LoginResponse {
  access_token: string
  token_type: string
  user: UserIdentity
}

/**
 * AI by zb: 描述随机消费邮箱结果。
 */
export interface RandomMailboxResponse {
  id: number
  email: string
  domain: string
  site_code: string
  site_name: string
  batch_code: string
}

/**
 * AI by zb: 描述通用操作接口返回。
 */
export interface OperationStatusPayload {
  ok: boolean
  message: string
  email: string
}
