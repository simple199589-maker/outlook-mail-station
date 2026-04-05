/**
 * AI by zb: 统一发起后端 API 请求。
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAdminToken()
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  })

  if (response.status === 401) {
    clearAdminToken()
    if (!window.location.pathname.startsWith('/share/')) {
      window.location.href = '/login'
    }
    throw new Error('登录已失效，请重新登录')
  }

  if (!response.ok) {
    const text = await response.text()
    try {
      const payload = JSON.parse(text)
      throw new Error(payload.detail || text)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(text)
      }
      throw error
    }
  }

  return response.json() as Promise<T>
}

/**
 * AI by zb: 读取管理员登录令牌。
 */
export function getAdminToken(): string {
  return localStorage.getItem('oms_admin_token') || ''
}

/**
 * AI by zb: 写入管理员登录令牌。
 */
export function setAdminToken(token: string): void {
  localStorage.setItem('oms_admin_token', token)
}

/**
 * AI by zb: 清理管理员登录令牌。
 */
export function clearAdminToken(): void {
  localStorage.removeItem('oms_admin_token')
}

/**
 * AI by zb: 执行管理员退出登录。
 */
export function logoutAdmin(): void {
  clearAdminToken()
  window.location.href = '/login'
}

/**
 * AI by zb: 将 ISO 时间格式化为本地易读字符串。
 */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '未同步'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

/**
 * AI by zb: 安全复制文本到剪贴板。
 */
export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}

/**
 * AI by zb: 生成发件人展示文案。
 */
export function formatSender(name: string, email: string): string {
  return name ? `${name} <${email}>` : email
}
