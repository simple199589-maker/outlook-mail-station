import { useEffect, useState } from 'react'

import { copyText, formatSender, formatTime } from '@/lib/api'
import { MessageDetail } from '@/types'
import { ShellModal } from '@/components/ShellModal'

/**
 * AI by zb: 渲染邮件详情弹窗，并支持复制正文中的验证码。
 */
export function MessageDetailModal({
  open,
  message,
  onClose,
  onFlash,
}: {
  open: boolean
  message: MessageDetail | null
  onClose: () => void
  onFlash: (type: 'success' | 'error', text: string) => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    setCopyState('idle')
  }, [open, message?.id])

  if (!open || !message) return null

  const codeMatch = (message.body_text || message.preview || '').match(/\b(\d{6})\b/)
  const securityCode = codeMatch?.[1] || ''
  const copyHintText = copyState === 'success' ? '已复制' : copyState === 'error' ? '复制失败，重试' : '点击复制'

  /**
   * AI by zb: 复制当前邮件中识别到的验证码，并在按钮上反馈结果。
   */
  const handleCopySecurityCode = async () => {
    if (!securityCode) {
      return
    }
    try {
      await copyText(securityCode)
      setCopyState('success')
      onFlash('success', `验证码 ${securityCode} 已复制`)
    } catch {
      setCopyState('error')
      onFlash('error', '复制验证码失败')
    }
  }

  return (
    <ShellModal
      open={open}
      title={message.subject || '邮件详情'}
      onClose={onClose}
      className="shell-modal--message-detail"
      bodyClassName="shell-modal__body--message-detail"
      header={
        <div className="shell-modal__header shell-modal__header--message-detail">
          <div className="message-modal__title">
            <span className="message-modal__title-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="4" width="17" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 9.5h10M7 13h6M7 16.5h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <div className="shell-modal__eyebrow">邮件详情</div>
              <h3>{message.subject || '无主题'}</h3>
            </div>
          </div>
          <button className="icon-close-button icon-close-button--large" onClick={onClose} type="button" aria-label="关闭邮件详情">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      }
      footer={
        <button className="gradient-button" type="button" onClick={onClose}>
          关闭
        </button>
      }
    >
      {securityCode ? (
        <button
          type="button"
          className={`detail-code-chip ${copyState === 'success' ? 'is-success' : copyState === 'error' ? 'is-error' : ''}`}
          onClick={handleCopySecurityCode}
        >
          <span className="detail-code-chip__icon">🔑</span>
          <strong>{securityCode}</strong>
          <span className="detail-code-chip__hint" aria-live="polite">{copyHintText}</span>
        </button>
      ) : null}

      <div className="message-detail message-detail--modal">
        <div className="message-detail__header">
          <div className="message-detail__meta">{formatTime(message.sent_at)}</div>
        </div>
        <div className="message-detail__info">
          <span>发件人：{formatSender(message.sender_name, message.sender_email)}</span>
          <span>收件人：{message.recipient_summary || '仅当前邮箱'}</span>
        </div>
        <div className="message-detail__body message-detail__body--modal">
          {message.body_html ? (
            <div dangerouslySetInnerHTML={{ __html: message.body_html }} />
          ) : (
            <pre>{message.body_text || '暂无正文'}</pre>
          )}
        </div>
      </div>
    </ShellModal>
  )
}
