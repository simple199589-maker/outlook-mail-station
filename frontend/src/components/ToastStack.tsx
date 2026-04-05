/**
 * AI by zb: 描述单条浮动提示消息。
 */
export interface ToastMessage {
  id: number
  type: 'success' | 'error'
  text: string
}

/**
 * AI by zb: 渲染左上角堆叠弹出的统一提示消息。
 */
export function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  if (!toasts.length) return null

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`} role="status">
          <span className="toast__icon" aria-hidden="true">
            {toast.type === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 4.2 4.2L19 6.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v5" />
                <path d="M12 16h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            )}
          </span>
          <span className="toast__text">{toast.text}</span>
        </div>
      ))}
    </div>
  )
}
