import './user-api-key-modal.css'

import { formatTime } from '@/lib/api'

/**
 * AI by zb: 复用的用户级 API Key 管理弹窗。
 */
export function UserApiKeyModal({
  open,
  username,
  apiKey,
  updatedAt,
  loading,
  copied,
  busy,
  onClose,
  onCopy,
  onRegenerate,
}: {
  open: boolean
  username: string
  apiKey: string
  updatedAt?: string | null
  loading: boolean
  copied: boolean
  busy: boolean
  onClose: () => void
  onCopy: () => void
  onRegenerate: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="shell-modal__backdrop" onClick={onClose}>
      <div className="shell-modal shell-modal--compact user-api-key-modal" onClick={(event) => event.stopPropagation()}>
        <div className="shell-modal__header user-api-key-modal__header">
          <div className="user-api-key-modal__title">
            <span className="section-kicker">开放接口</span>
            <h3>{username} 的 API Key</h3>
            <p>首次打开会自动生成，后续可直接复制给对应用户或接入方使用。</p>
          </div>
          <button className="icon-close-button shell-modal__close" type="button" onClick={onClose} aria-label="关闭 API Key 弹窗">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="shell-modal__body user-api-key-modal__body">
          <div className="user-api-key-modal__intro">
            <strong>专属用户池调用凭证</strong>
            <span>使用该 Key 调用 `/api/open/*` 时会自动绑定到 {username} 的邮箱池，但消费邮箱时仍需传站点编码。</span>
          </div>
          <label className="user-api-key-modal__field" htmlFor="shared-user-api-key-value">
            <span>当前 API Key</span>
            <input
              id="shared-user-api-key-value"
              readOnly
              value={loading ? '加载中...' : apiKey || ''}
              placeholder="首次打开时会自动生成 API Key"
            />
            <small>{updatedAt ? `最近更新：${formatTime(updatedAt)}` : '打开后若该用户还没有 Key，会自动完成初始化。'}</small>
          </label>
        </div>
        <div className="shell-modal__footer user-api-key-modal__footer">
          <button className="ghost-button" type="button" onClick={onClose}>
            关闭
          </button>
          <button className="ghost-button" type="button" onClick={onCopy} disabled={!apiKey || loading}>
            {copied ? '已复制' : '复制 Key'}
          </button>
          <button className="gradient-button" type="button" onClick={onRegenerate} disabled={loading || busy}>
            {busy ? '重置中...' : '重新生成'}
          </button>
        </div>
      </div>
    </div>
  )
}
