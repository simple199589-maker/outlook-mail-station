import { ReactNode } from 'react'

/**
 * AI by zb: 提供统一风格的浮层弹窗容器。
 */
export function ShellModal({
  open,
  title,
  children,
  footer,
  onClose,
  header,
  className = '',
  bodyClassName = '',
  closeMode = 'text',
}: {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  header?: ReactNode
  className?: string
  bodyClassName?: string
  closeMode?: 'text' | 'icon'
}) {
  if (!open) return null

  return (
    <div className="shell-modal__backdrop" onClick={onClose}>
      <div className={`shell-modal ${className}`.trim()} onClick={(event) => event.stopPropagation()}>
        {header ? (
          header
        ) : (
          <div className="shell-modal__header">
            <div>
              <div className="shell-modal__eyebrow">Outlook Mail Station</div>
              <h3>{title}</h3>
            </div>
            <button
              className={closeMode === 'icon' ? 'icon-close-button' : 'ghost-button'}
              onClick={onClose}
              type="button"
              aria-label="关闭弹窗"
            >
              {closeMode === 'icon' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                '关闭'
              )}
            </button>
          </div>
        )}
        <div className={`shell-modal__body ${bodyClassName}`.trim()}>{children}</div>
        {footer ? <div className="shell-modal__footer">{footer}</div> : null}
      </div>
    </div>
  )
}
