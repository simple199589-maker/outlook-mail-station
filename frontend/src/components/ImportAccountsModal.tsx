import './import-accounts-modal.css'

import { ShellModal } from '@/components/ShellModal'
import { ImportResult } from '@/types'

/**
 * AI by zb: 复用的批量导入弹窗，统一承载格式说明、输入区与结果展示。
 */
export function ImportAccountsModal({
  open,
  title,
  description,
  targetName,
  targetStatus,
  value,
  onValueChange,
  batchValue,
  onBatchValueChange,
  placeholder,
  onClose,
  onSubmit,
  submitting,
  submitLabel,
  loadingLabel,
  result,
}: {
  open: boolean
  title: string
  description: string
  targetName?: string
  targetStatus?: string
  value: string
  onValueChange: (value: string) => void
  batchValue?: string
  onBatchValueChange?: (value: string) => void
  placeholder: string
  onClose: () => void
  onSubmit: () => void
  submitting: boolean
  submitLabel: string
  loadingLabel: string
  result?: ImportResult | null
}) {
  return (
    <ShellModal
      open={open}
      title={title}
      onClose={onClose}
      className="shell-modal--import"
      bodyClassName="shell-modal__body--import-layout"
      closeMode="icon"
      header={(
        <div className="shell-modal__header import-accounts-modal__header">
          <div className="import-accounts-modal__copy">
            <span className="section-kicker">批量导入</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          {targetName || targetStatus ? (
            <div className="import-accounts-modal__meta">
              {targetName ? (
                <div>
                  <span>目标用户</span>
                  <strong>{targetName}</strong>
                </div>
              ) : null}
              {targetStatus ? (
                <div>
                  <span>当前状态</span>
                  <strong>{targetStatus}</strong>
                </div>
              ) : null}
            </div>
          ) : null}
          <button className="icon-close-button shell-modal__close" type="button" onClick={onClose} aria-label="关闭导入邮箱弹窗">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
      footer={(
        <>
          <button className="ghost-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="gradient-button" type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? loadingLabel : submitLabel}
          </button>
        </>
      )}
    >
      <div className={`import-accounts-modal__layout ${result ? 'has-result' : 'is-editor-wide'}`}>
        <label className="import-accounts-modal__editor" htmlFor="import-accounts-textarea">
          <span className="import-accounts-modal__field-label">账户内容</span>
          <textarea
            id="import-accounts-textarea"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            rows={14}
            placeholder={placeholder}
          />
          <small>每行一条记录，支持批量粘贴后一并导入。</small>
        </label>

        <div className="import-accounts-modal__side">
          {onBatchValueChange ? (
            <label className="import-accounts-modal__panel import-accounts-modal__batch-field" htmlFor="import-accounts-batch">
              <span className="import-accounts-modal__field-label">批次号</span>
              <input
                id="import-accounts-batch"
                value={batchValue || ''}
                onChange={(event) => onBatchValueChange(event.target.value)}
                placeholder="批次号（可选）"
              />
              <small>可用于后续筛选和归档同一批次导入的邮箱。</small>
            </label>
          ) : null}

          {result ? (
            <div className="import-accounts-modal__panel import-accounts-modal__result">
              <strong>导入结果</strong>
              <div className="import-accounts-modal__result-grid">
                <div>
                  <span>总数</span>
                  <strong>{result.total}</strong>
                </div>
                <div>
                  <span>新增</span>
                  <strong>{result.created}</strong>
                </div>
                <div>
                  <span>更新</span>
                  <strong>{result.updated}</strong>
                </div>
                <div>
                  <span>失败</span>
                  <strong>{result.failed}</strong>
                </div>
              </div>
              {result.errors.length ? <pre>{result.errors.join('\n')}</pre> : null}
            </div>
          ) : null}
        </div>
      </div>
    </ShellModal>
  )
}
