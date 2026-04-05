/**
 * AI by zb: 描述邮箱列表项。
 */
export interface AccountItem {
  id: number
  email: string
  enabled: boolean
  is_pinned: boolean
  note: string
  created_at: string
  updated_at: string
  last_synced_at: string | null
  last_error: string
  inbox_count: number
  sent_count: number
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
 * AI by zb: 描述当前邮箱详情。
 */
export interface AccountDetail extends AccountItem {
  has_password: boolean
  has_oauth: boolean
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
