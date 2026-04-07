import '../pages/user-management.css'

import { AccountItem } from '@/types'

type TransferCandidate = {
  id: number
  username: string
}

/**
 * AI by zb: 复用的用户账户管理弹窗，统一承载筛选、批量操作与 API Key 维护。
 */
export function UserAccountManagementModal({
  open,
  username,
  onClose,
  onOpenImport,
  onExport,
  exportBusy,
  scope,
  keywordInput,
  batchInput,
  availableBatchCodes,
  onScopeChange,
  onKeywordInputChange,
  onBatchInputChange,
  onSearchSubmit,
  onResetFilters,
  hasSelectedAccounts,
  selectionLabel,
  selectionHint,
  onBatchEnable,
  onBatchDisable,
  batchEnableBusy,
  batchDisableBusy,
  allowTransfer = false,
  transferTargetUserId = 0,
  transferCandidates = [],
  onTransferTargetChange,
  onBatchMove,
  batchMoveBusy,
  accounts,
  selectedAccountIds,
  allVisibleSelected,
  onToggleAllAccounts,
  onToggleAccountSelection,
  onOpenAccountQuery,
  accountPage,
  accountTotalPages,
  accountTotal,
  onPrevPage,
  onNextPage,
}: {
  open: boolean
  username: string
  onClose: () => void
  onOpenImport: () => void
  onExport: () => void
  exportBusy: boolean
  scope: 'all' | 'pool' | 'consumed'
  keywordInput: string
  batchInput: string
  availableBatchCodes: string[]
  onScopeChange: (scope: 'all' | 'pool' | 'consumed') => void
  onKeywordInputChange: (value: string) => void
  onBatchInputChange: (value: string) => void
  onSearchSubmit: () => void
  onResetFilters: () => void
  hasSelectedAccounts: boolean
  selectionLabel: string
  selectionHint: string
  onBatchEnable: () => void
  onBatchDisable: () => void
  batchEnableBusy: boolean
  batchDisableBusy: boolean
  allowTransfer?: boolean
  transferTargetUserId?: number
  transferCandidates?: TransferCandidate[]
  onTransferTargetChange?: (value: number) => void
  onBatchMove?: () => void
  batchMoveBusy?: boolean
  accounts: AccountItem[]
  selectedAccountIds: number[]
  allVisibleSelected: boolean
  onToggleAllAccounts: () => void
  onToggleAccountSelection: (accountId: number) => void
  onOpenAccountQuery: (account: AccountItem) => void
  accountPage: number
  accountTotalPages: number
  accountTotal: number
  onPrevPage: () => void
  onNextPage: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="shell-modal__backdrop shell-modal__backdrop--full" onClick={onClose}>
      <div className="shell-modal shell-modal--full user-admin-shell" onClick={(event) => event.stopPropagation()}>
        <div className="shell-modal__header user-admin-shell__header">
          <div className="user-admin-shell__title">
            <div className="user-admin-shell__headline">
              <span className="section-kicker">账户管理</span>
              <h3>{username}</h3>
            </div>
          </div>
          <div className="user-admin-shell__header-actions">
            <button className="ghost-button" type="button" onClick={onOpenImport}>
              导入邮箱
            </button>
            <button className="ghost-button" type="button" onClick={onExport} disabled={exportBusy}>
              {exportBusy ? '导出中...' : '导出邮箱'}
            </button>
            <button className="icon-close-button shell-modal__close" type="button" onClick={onClose} aria-label="关闭账户管理弹窗">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="user-admin-shell__body">
          <div className="user-admin-shell__controls">
            <div className="user-admin-filters user-admin-filters--compact user-admin-shell__controls-row">
              <div className="user-admin-filters__scope">
                <button className={`ghost-button ${scope === 'all' ? 'is-active' : ''}`} type="button" onClick={() => onScopeChange('all')}>
                  全部
                </button>
                <button className={`ghost-button ${scope === 'pool' ? 'is-active' : ''}`} type="button" onClick={() => onScopeChange('pool')}>
                  池内
                </button>
                <button className={`ghost-button ${scope === 'consumed' ? 'is-active' : ''}`} type="button" onClick={() => onScopeChange('consumed')}>
                  已消费
                </button>
              </div>
              <div className="user-admin-filters__search user-admin-filters__search--wide">
                <input value={keywordInput} onChange={(event) => onKeywordInputChange(event.target.value)} placeholder="搜索邮箱" />
                <input list="shared-manage-batch-options" value={batchInput} onChange={(event) => onBatchInputChange(event.target.value)} placeholder="批次" />
                <datalist id="shared-manage-batch-options">
                  {availableBatchCodes.map((code) => <option key={code} value={code} />)}
                </datalist>
                <button className="ghost-button" type="button" onClick={onSearchSubmit}>
                  筛选
                </button>
                <button className="ghost-button" type="button" onClick={onResetFilters}>
                  重置
                </button>
              </div>
            </div>

            {hasSelectedAccounts ? (
              <div className="user-admin-panel__toolbar user-admin-panel__toolbar--compact user-admin-shell__controls-row user-admin-shell__controls-row--batch">
                <div className="user-admin-panel__toolbar-copy user-admin-shell__selection-copy">
                  <strong>{selectionLabel}</strong>
                  <span>{selectionHint}</span>
                </div>
                <div className="user-admin-panel__toolbar-actions user-admin-panel__toolbar-actions--split">
                  <div className="user-admin-panel__action-group user-admin-panel__action-group--batch">
                    <button className="ghost-button user-admin-panel__mini-button" type="button" onClick={onBatchEnable} disabled={batchEnableBusy || batchDisableBusy || batchMoveBusy}>
                      {batchEnableBusy ? '启用中...' : '批量启用'}
                    </button>
                    <button className="ghost-button user-admin-panel__mini-button" type="button" onClick={onBatchDisable} disabled={batchEnableBusy || batchDisableBusy || batchMoveBusy}>
                      {batchDisableBusy ? '禁用中...' : '批量禁用'}
                    </button>
                    {allowTransfer && onTransferTargetChange && onBatchMove ? (
                      <div className="user-admin-panel__transfer-group user-admin-panel__transfer-group--compact">
                        <select value={transferTargetUserId} onChange={(event) => onTransferTargetChange(Number(event.target.value))} disabled={!transferCandidates.length || batchMoveBusy}>
                          {transferCandidates.length ? transferCandidates.map((user) => (
                            <option key={user.id} value={user.id}>{user.username}</option>
                          )) : <option value={0}>暂无目标</option>}
                        </select>
                        <button className="ghost-button user-admin-panel__mini-button" type="button" onClick={onBatchMove} disabled={!transferCandidates.length || batchEnableBusy || batchDisableBusy || batchMoveBusy}>
                          {batchMoveBusy ? '转移中...' : '批量转移'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="user-admin-table user-admin-table--full">
            <div className="user-admin-table__head user-admin-table__head--with-actions">
              <label className="user-admin-table__select-all">
                <input type="checkbox" checked={allVisibleSelected} onChange={onToggleAllAccounts} disabled={!accounts.length} />
                <span>全选</span>
              </label>
              <span>邮箱</span>
              <span>归属</span>
              <span>状态</span>
              <span>收件</span>
              <span>发件</span>
              <span>站点使用</span>
              <span>操作</span>
            </div>
            <div className="user-admin-table__body">
              {accounts.length ? accounts.map((account) => {
                const isSelected = selectedAccountIds.includes(account.id)
                return (
                  <div key={account.id} className={`user-admin-table__row user-admin-table__row--with-actions ${isSelected ? 'is-selected' : ''}`}>
                    <label className="user-admin-table__checkbox">
                      <input type="checkbox" checked={isSelected} onChange={() => onToggleAccountSelection(account.id)} />
                    </label>
                    <span className="user-admin-table__cell user-admin-table__cell--email">
                      <strong>{account.email}</strong>
                      <small>{account.is_consumed ? '已消费账户' : '池内账户'}</small>
                    </span>
                    <span className="user-admin-table__cell">{account.owner_username || username || '-'}</span>
                    <span className="user-admin-table__cell">
                      <span className={`status-pill ${account.enabled ? 'is-good' : 'is-muted'}`}>{account.enabled ? '启用' : '禁用'}</span>
                    </span>
                    <span className="user-admin-table__cell user-admin-table__cell--number">{account.inbox_count}</span>
                    <span className="user-admin-table__cell user-admin-table__cell--number">{account.sent_count}</span>
                    <span className="user-admin-table__cell">
                      {account.active_sites.length ? account.active_sites.map((site) => site.site_name).join(' / ') : '未使用'}
                    </span>
                    <span className="user-admin-table__cell user-admin-table__cell--actions">
                      <button className="ghost-button user-admin-table__action-button" type="button" onClick={() => onOpenAccountQuery(account)}>
                        查询
                      </button>
                    </span>
                  </div>
                )
              }) : (
                <div className="user-admin-table__empty">当前筛选条件下暂无账户邮箱数据</div>
              )}
            </div>
          </div>

          <div className="user-admin-pagination user-admin-pagination--sticky">
            <div className="user-admin-pagination__summary">第 {accountPage} / {accountTotalPages} 页 · 共 {accountTotal} 条</div>
            <div className="user-admin-pagination__actions">
              <button className="ghost-button" type="button" onClick={onPrevPage} disabled={accountPage <= 1}>
                上一页
              </button>
              <button className="ghost-button" type="button" onClick={onNextPage} disabled={accountPage >= accountTotalPages}>
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
