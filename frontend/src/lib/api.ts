import { AccountDetail, AccountListResponse, AuthStatusResponse, ImportResult, LoginResponse, MessageDetail, MessageItem, OperationStatusPayload, PoolSummary, PublicSharePayload, RandomConsumeAccountResponse, RandomMailboxResponse, ShareResult, SiteItem, SiteListResponse, UserApiKeyPayload, UserListResponse } from '@/types'

const ADMIN_TOKEN_KEY = 'oms_admin_token'

/**
 * AI by zb: 获取本地保存的后台登录令牌。
 */
export function getAdminToken() {
  return window.localStorage.getItem(ADMIN_TOKEN_KEY)
}

/**
 * AI by zb: 持久化后台登录令牌。
 */
export function setAdminToken(token: string) {
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

/**
 * AI by zb: 清理后台登录令牌。
 */
export function clearAdminToken() {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY)
}

/**
 * AI by zb: 统一发起带后台鉴权头的接口请求。
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  headers.set('Content-Type', 'application/json')
  const token = getAdminToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(path, {
    ...init,
    headers,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const detail = payload && typeof payload.detail === 'string' ? payload.detail : `请求失败：${response.status}`
    throw new Error(detail)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

/**
 * AI by zb: 使用用户级 API Key 调用开放接口。
 */
export async function openApiFetch<T>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> {
  const resolvedApiKey = apiKey.trim()
  if (!resolvedApiKey) {
    throw new Error('用户级 API Key 不能为空')
  }
  const headers = new Headers(init.headers || {})
  headers.set('Content-Type', 'application/json')
  headers.set('X-API-Key', resolvedApiKey)
  const response = await fetch(path, {
    ...init,
    headers,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const detail = payload && typeof payload.detail === 'string' ? payload.detail : `请求失败：${response.status}`
    throw new Error(detail)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

/**
 * AI by zb: 将 UTC 时间统一格式化为北京时间。
 */
export function formatTime(value?: string | null) {
  if (!value) {
    return '未同步'
  }
  const raw = value.trim()
  const hasTimezone = /(?:[zZ]|[+\-]\d{2}:\d{2})$/.test(raw)
  const normalized = hasTimezone
    ? raw
    : raw.includes('T')
      ? `${raw}Z`
      : `${raw.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(date)
}

/**
 * AI by zb: 组合发件人名称与邮箱地址。
 */
export function formatSender(name?: string | null, email?: string | null) {
  const safeName = name?.trim()
  const safeEmail = email?.trim()
  if (safeName && safeEmail) {
    return `${safeName} <${safeEmail}>`
  }
  return safeName || safeEmail || '未知发件人'
}

/**
 * AI by zb: 复制文本到系统剪贴板。
 */
export async function copyText(text: string) {
  const resolvedText = String(text ?? '')
  if (!resolvedText) {
    return
  }

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(resolvedText)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = resolvedText
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('复制失败')
  }
}

/**
 * AI by zb: 获取后台登录状态。
 */
export function fetchAuthStatus() {
  return apiFetch<AuthStatusResponse>('/api/admin/auth/status')
}

/**
 * AI by zb: 使用用户名和密码执行后台登录。
 */
export function login(payload: { username: string; password: string }) {
  return apiFetch<LoginResponse>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 获取后台用户列表。
 */
export function fetchUsers() {
  return apiFetch<UserListResponse>('/api/users')
}

/**
 * AI by zb: 获取站点配置列表。
 */
export function fetchSites() {
  return apiFetch<SiteListResponse>('/api/sites')
}

/**
 * AI by zb: 创建站点配置。
 */
export function createSite(payload: { code: string; name: string; enabled?: boolean }) {
  return apiFetch<SiteItem>('/api/sites', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 更新指定站点配置。
 */
export function updateSite(siteId: number, payload: { code?: string; name?: string; enabled?: boolean }) {
  return apiFetch<SiteItem>(`/api/sites/${siteId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 创建后台用户。
 */
export function createUser(payload: { username: string; password: string; role?: string; enabled?: boolean }) {
  return apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 更新后台用户状态或密码。
 */
export function updateUser(userId: number, payload: { password?: string; enabled?: boolean }) {
  return apiFetch(`/api/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 获取指定用户当前可用的开放接口 API Key。
 */
export function fetchUserApiKey(userId: number) {
  return apiFetch<UserApiKeyPayload>(`/api/users/${userId}/api-key`)
}

/**
 * AI by zb: 重新生成指定用户的开放接口 API Key。
 */
export function regenerateUserApiKey(userId: number) {
  return apiFetch<UserApiKeyPayload>(`/api/users/${userId}/api-key/regenerate`, {
    method: 'POST',
  })
}

/**
 * AI by zb: 获取指定作用域与批次下的邮箱列表。
 */
export function fetchAccounts(params: { page: number; pageSize: number; keyword: string; scope: 'consumed' | 'pool' | 'all'; batchCode?: string; userId?: number | null; siteCode?: string }) {
  const search = new URLSearchParams()
  search.set('page', String(params.page))
  search.set('page_size', String(params.pageSize))
  search.set('keyword', params.keyword)
  search.set('scope', params.scope)
  search.set('batch_code', params.batchCode || '')
  search.set('site_code', params.siteCode || '')
  if (params.userId) {
    search.set('user_id', String(params.userId))
  }
  return apiFetch<AccountListResponse>(`/api/accounts?${search.toString()}`)
}

/**
 * AI by zb: 导出指定作用域与批次下的邮箱 CSV 文件。
 */
export async function exportAccounts(params: { keyword?: string; scope?: 'consumed' | 'pool' | 'all'; batchCode?: string; userId?: number | null; siteCode?: string }) {
  const search = new URLSearchParams()
  search.set('keyword', params.keyword || '')
  search.set('scope', params.scope || 'all')
  search.set('batch_code', params.batchCode || '')
  search.set('site_code', params.siteCode || '')
  if (params.userId) {
    search.set('user_id', String(params.userId))
  }

  const headers = new Headers()
  const token = getAdminToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`/api/accounts/export?${search.toString()}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const detail = payload && typeof payload.detail === 'string' ? payload.detail : `请求失败：${response.status}`
    throw new Error(detail)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  const matched = disposition.match(/filename="?([^";]+)"?/i)
  const filename = matched?.[1] || 'accounts.csv'
  return { blob, filename }
}

/**
 * AI by zb: 获取指定邮箱详情。
 */
export function fetchAccountDetail(accountId: number) {
  return apiFetch<AccountDetail>(`/api/accounts/${accountId}`)
}

/**
 * AI by zb: 更新邮箱启停、备注和置顶状态。
 */
export function updateAccount(accountId: number, payload: { enabled?: boolean; note?: string; is_pinned?: boolean; owner_user_id?: number }) {
  return apiFetch<AccountDetail>(`/api/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 批量更新邮箱启停状态。
 */
export async function updateAccountsEnabled(accountIds: number[], enabled: boolean) {
  const tasks = accountIds.map((accountId) => updateAccount(accountId, { enabled }))
  return Promise.all(tasks)
}

/**
 * AI by zb: 批量转移邮箱到指定用户池。
 */
export function moveAccountsToUserPool(payload: { account_ids: number[]; owner_user_id: number }) {
  return apiFetch<{ ok: boolean; message: string }>('/api/accounts/batch-move', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 从当前站点的账号池中随机使用一个邮箱。
 */
export function consumeRandomPoolAccount(payload: { site_code: string; owner_user_id?: number | null; page_size?: number }) {
  return apiFetch<RandomConsumeAccountResponse>('/api/accounts/random-consume', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 导入邮箱到指定用户池。
 */
export function importAccounts(payload: { data: string; enabled?: boolean; batch_code?: string; owner_user_id?: number | null }) {
  return apiFetch<ImportResult>('/api/accounts/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 获取当前用户或目标用户的池摘要。
 */
export function fetchPoolSummary(userId?: number | null, siteCode?: string) {
  const search = new URLSearchParams()
  if (userId) {
    search.set('user_id', String(userId))
  }
  if (siteCode) {
    search.set('site_code', siteCode)
  }
  return apiFetch<PoolSummary>(`/api/accounts/pool-summary${search.toString() ? `?${search.toString()}` : ''}`)
}

/**
 * AI by zb: 释放指定邮箱在某个站点上的使用状态。
 */
export function releaseAccount(accountId: number, payload: { site_code: string }) {
  return apiFetch<OperationStatusPayload>(`/api/accounts/${accountId}/release`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 手动将指定邮箱标记为使用中。
 */
export function consumeAccount(accountId: number, payload: { site_code: string }) {
  return apiFetch<OperationStatusPayload>(`/api/accounts/${accountId}/consume`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 删除指定邮箱及其相关缓存。
 */
export function deleteAccount(accountId: number) {
  return apiFetch<OperationStatusPayload>(`/api/accounts/${accountId}`, {
    method: 'DELETE',
  })
}

/**
 * AI by zb: 通过用户级开放接口随机领取一个邮箱。
 */
export function consumeRandomMailbox(apiKey: string, payload: { site_code: string; batch_code?: string; domain?: string }) {
  return openApiFetch<RandomMailboxResponse>('/api/open/random-email', apiKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 刷新指定邮箱的邮件缓存。
 */
export function syncAccount(accountId: number) {
  return apiFetch(`/api/accounts/${accountId}/sync`, {
    method: 'POST',
  })
}

/**
 * AI by zb: 获取指定邮箱文件夹的邮件列表。
 */
export function fetchMessages(accountId: number, folder: 'inbox' | 'sent') {
  const search = new URLSearchParams()
  search.set('folder', folder)
  return apiFetch<MessageItem[]>(`/api/accounts/${accountId}/messages?${search.toString()}`)
}

/**
 * AI by zb: 获取指定邮件详情。
 */
export function fetchMessageDetail(_accountId: number, messageId: number) {
  return apiFetch<MessageDetail>(`/api/accounts/${_accountId}/messages/${messageId}`)
}

/**
 * AI by zb: 发送邮件。
 */
export function sendMail(accountId: number, payload: { to: string; cc?: string; bcc?: string; subject: string; body_text?: string; body_html?: string }) {
  return apiFetch(`/api/accounts/${accountId}/send`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI by zb: 创建临时授权链接。
 */
export function createShare(accountId: number, days: number) {
  return apiFetch<ShareResult>(`/api/accounts/${accountId}/shares`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  })
}

/**
 * AI by zb: 获取公开授权页面数据。
 */
export function fetchPublicShare(token: string) {
  return apiFetch<PublicSharePayload>(`/api/public/shares/${token}`)
}
