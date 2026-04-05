import { AccountItem } from '@/types'
import { formatTime } from '@/lib/api'

/**
 * AI by zb: 渲染左侧 Outlook 邮箱列表、置顶操作与删除入口。
 */
export function AccountSidebar({
  accounts,
  query,
  total,
  page,
  totalPages,
  selectedId,
  onQueryChange,
  onSelect,
  onOpenImport,
  onTogglePin,
  onRequestDelete,
  onPageChange,
  pinningId,
  deletingId,
}: {
  accounts: AccountItem[]
  query: string
  total: number
  page: number
  totalPages: number
  selectedId: number | null
  onQueryChange: (value: string) => void
  onSelect: (id: number) => void
  onOpenImport: () => void
  onTogglePin: (account: AccountItem) => void
  onRequestDelete: (account: AccountItem) => void
  onPageChange: (page: number) => void
  pinningId: number | null
  deletingId: number | null
}) {
  return (
    <aside className="sidebar-card sidebar-card--accounts">
      <div className="sidebar-card__header sidebar-card__header--accounts">
        <div className="sidebar-card__header-main">
          <span className="sidebar-card__glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.75 7.5A2.25 2.25 0 0 1 6 5.25h12A2.25 2.25 0 0 1 20.25 7.5v9A2.25 2.25 0 0 1 18 18.75H6a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
              <path d="m4.5 7.5 6.558 5.246a1.5 1.5 0 0 0 1.884 0L19.5 7.5" />
            </svg>
          </span>
          <h2>有效邮箱</h2>
        </div>

        <div className="sidebar-card__header-side">
          <span className="sidebar-card__count">{total} 邮箱</span>
          <button className="ghost-button sidebar-card__import-button" type="button" onClick={onOpenImport}>
            导入
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索有效邮箱"
        />
      </div>

      <div className="sidebar-list sidebar-list--accounts">
        {accounts.map((account) => (
          <div
            key={account.id}
            className={`mailbox-item ${selectedId === account.id ? 'is-active' : ''} ${account.is_pinned ? 'is-pinned' : ''}`}
          >
            <button type="button" className="mailbox-item__main" onClick={() => onSelect(account.id)} title={account.email}>
              <div className="mailbox-item__top">
                <div className="mailbox-item__title-wrap">
                  {account.is_pinned ? (
                    <span className="mailbox-item__pin-mark" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.25 4.5 19.5 9.75l-2.625.75-3 3v4.5l-1.875-1.875L10.125 18v-4.5l-3-3L4.5 9.75 9.75 4.5" />
                        <path d="M12 13.5v6" />
                      </svg>
                    </span>
                  ) : null}
                  <strong className="mailbox-item__email" title={account.email}>{account.email}</strong>
                </div>
              </div>
              <div className="mailbox-item__time">{formatTime(account.last_synced_at || account.updated_at)}</div>
            </button>

            <div className="mailbox-item__quick-actions">
              <button
                className={`mailbox-item__icon-button ${account.is_pinned ? 'is-active' : ''}`}
                type="button"
                onClick={() => onTogglePin(account)}
                disabled={pinningId === account.id}
                title={account.is_pinned ? '取消置顶邮箱' : '置顶邮箱'}
                aria-label={account.is_pinned ? '取消置顶邮箱' : '置顶邮箱'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.25 4.5 19.5 9.75l-2.625.75-3 3v4.5l-1.875-1.875L10.125 18v-4.5l-3-3L4.5 9.75 9.75 4.5" />
                  <path d="M12 13.5v6" />
                </svg>
              </button>
              <button
                className="mailbox-item__icon-button is-danger"
                type="button"
                onClick={() => onRequestDelete(account)}
                disabled={deletingId === account.id}
                title="删除邮箱"
                aria-label="删除邮箱"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 7.5h15" />
                  <path d="M9.75 7.5V5.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V7.5" />
                  <path d="m18 7.5-.684 10.26a1.125 1.125 0 0 1-1.122 1.05H7.806a1.125 1.125 0 0 1-1.122-1.05L6 7.5" />
                  <path d="M10.5 11.25v4.5" />
                  <path d="M13.5 11.25v4.5" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 ? <div className="empty-block">还没有邮箱，先导入一批 Outlook 账号。</div> : null}
      </div>

      <div className="sidebar-pagination">
        <button className="ghost-button sidebar-pagination__button" type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          上一页
        </button>
        <div className="sidebar-pagination__meta">
          第 {page} / {Math.max(totalPages, 1)} 页
        </div>
        <button
          className="ghost-button sidebar-pagination__button"
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          下一页
        </button>
      </div>
    </aside>
  )
}
