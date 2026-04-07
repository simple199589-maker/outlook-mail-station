import { AccountItem, SiteItem, UserItem } from '@/types'
import { formatTime } from '@/lib/api'

/**
 * AI by zb: 渲染左侧邮箱工作台与筛选入口。
 */
export function AccountSidebar({
  accounts,
  query,
  total,
  page,
  totalPages,
  selectedId,
  scope,
  selectedSiteCode,
  inboxTotal,
  currentUser,
  users,
  sites,
  activeUserId,
  onQueryChange,
  onSelect,
  onOpenImport,
  onTogglePin,
  onRequestRelease,
  onRequestDelete,
  onRequestConsume,
  onSiteChange,
  onUserChange,
  onScopeChange,
  onPageChange,
  pinningId,
  releasingId,
}: {
  accounts: AccountItem[]
  query: string
  total: number
  page: number
  totalPages: number
  selectedId: number | null
  scope: 'consumed' | 'pool'
  selectedSiteCode: string
  inboxTotal: number
  currentUser: UserItem | null
  users: UserItem[]
  sites: SiteItem[]
  activeUserId: number | null
  onQueryChange: (value: string) => void
  onSelect: (id: number) => void
  onOpenImport: () => void
  onTogglePin: (account: AccountItem) => void
  onRequestRelease: (account: AccountItem) => void
  onRequestDelete: (account: AccountItem) => void
  onRequestConsume: (account: AccountItem) => void
  onSiteChange: (siteCode: string) => void
  onUserChange: (userId: number) => void
  onScopeChange: (scope: 'consumed' | 'pool') => void
  onPageChange: (page: number) => void
  pinningId: number | null
  releasingId: number | null
}) {
  const isAdmin = currentUser?.role === 'admin'
  const selectedSite = sites.find((item) => item.code === selectedSiteCode) || null
  const sidebarTitle = '邮箱工作台'
  const sidebarSubtitle = `收信总封数 ${inboxTotal} 封`
  const emptyText = scope === 'consumed'
    ? `当前站点 ${selectedSite?.name || '未选择'} 下还没有已消费邮箱。`
    : `当前站点 ${selectedSite?.name || '未选择'} 下还没有可用邮箱。`
  const pinnedAccounts = accounts.filter((account) => account.is_pinned)
  const issueAccounts = accounts.filter((account) => Boolean(account.last_error))
  const healthyConsumedAccounts = accounts.filter((account) => account.is_consumed && !account.is_pinned && !account.last_error)
  const readyPoolAccounts = accounts.filter((account) => !account.is_consumed && !account.is_pinned && !account.last_error)
  const normalAccounts = scope === 'consumed' ? healthyConsumedAccounts : readyPoolAccounts
  const groups = [
    { key: 'pinned', title: '置顶邮箱', hint: '优先关注', accounts: pinnedAccounts, accent: 'is-pinned' },
    { key: 'issues', title: '异常邮箱', hint: '需处理', accounts: issueAccounts, accent: 'is-danger' },
    { key: 'normal', title: scope === 'consumed' ? '稳定邮箱' : '可领取邮箱', hint: `${normalAccounts.length} 项`, accounts: normalAccounts, accent: 'is-neutral' },
  ].filter((group) => group.accounts.length > 0)

  const renderAccountItem = (account: AccountItem) => {
    const consumedForSite = selectedSiteCode ? account.active_sites.some((site) => site.site_code === selectedSiteCode) : account.is_consumed
    const statusText = consumedForSite ? '已消费' : '待领取'
    const syncText = formatTime(account.last_synced_at || account.updated_at)
    const ownerLabel = account.owner_username || '未分配用户'
    const activeSiteCodes = new Set(account.active_sites.map((site) => site.site_code))
    const canUseCurrentSite = Boolean(selectedSiteCode) && !activeSiteCodes.has(selectedSiteCode)
    const canReleaseCurrentSite = Boolean(selectedSiteCode) && activeSiteCodes.has(selectedSiteCode)

    return (
      <div
        key={account.id}
        className={`mailbox-item ${selectedId === account.id ? 'is-active' : ''} ${account.is_pinned ? 'is-pinned' : ''} ${account.last_error ? 'has-issue' : ''}`}
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
              <div className="mailbox-item__identity">
                <strong className="mailbox-item__email" title={account.email}>{account.email}</strong>
                <div className="mailbox-item__chips">
                  <span className={`mailbox-item__status ${consumedForSite ? 'is-consumed' : 'is-pool'}`}>{statusText}</span>
                  {account.last_error ? <span className="mailbox-item__flag is-danger">异常</span> : null}
                </div>
                {account.active_sites.length ? (
                  <div className="mailbox-item__site-list">
                    {account.active_sites.map((site) => (
                      <span key={site.id} className="mailbox-item__site-chip" title={`${site.site_name} · ${site.source}`}>
                        {site.site_name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="mailbox-item__meta-grid mailbox-item__meta-grid--compact">
            <div>
              <span>用户</span>
              <span className="mailbox-item__meta-value" title={ownerLabel}>{ownerLabel}</span>
            </div>
            <div>
              <span>同步</span>
              <span className="mailbox-item__meta-value" title={syncText}>{syncText}</span>
            </div>
          </div>
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
          {canUseCurrentSite ? (
            <button
              className="mailbox-item__icon-button"
              type="button"
              onClick={() => onRequestConsume(account)}
              title="手动使用邮箱"
              aria-label="手动使用邮箱"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 5.5v13L18 12 8 5.5Z" />
              </svg>
            </button>
          ) : null}
          {canReleaseCurrentSite ? (
            <button
              className="mailbox-item__icon-button"
              type="button"
              onClick={() => onRequestRelease(account)}
              disabled={releasingId === account.id}
              title="退回邮箱"
              aria-label="退回邮箱"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 8H5v4" />
                <path d="M5 12a7 7 0 1 0 2.05-4.95L5 8" />
              </svg>
            </button>
          ) : null}
          <button
            className="mailbox-item__icon-button is-danger"
            type="button"
            onClick={() => onRequestDelete(account)}
            title={scope === 'consumed' ? '删除并停用邮箱' : '删除邮箱'}
            aria-label={scope === 'consumed' ? '删除并停用邮箱' : '删除邮箱'}
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
    )
  }

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
          <div className="sidebar-card__title-wrap">
            <h2>{sidebarTitle}</h2>
            <p>{sidebarSubtitle}</p>
          </div>
        </div>

        <div className="sidebar-card__header-side">
          {currentUser ? (
            <button className="ghost-button sidebar-card__import-button" type="button" onClick={onOpenImport}>
              导入
            </button>
          ) : null}
        </div>
      </div>

      <div className="sidebar-card__switches">
        <div className="tab-switcher tab-switcher--sidebar">
          <button className={scope === 'consumed' ? 'is-active' : ''} type="button" onClick={() => onScopeChange('consumed')}>
            已消费
          </button>
          <button className={scope === 'pool' ? 'is-active' : ''} type="button" onClick={() => onScopeChange('pool')}>
            账号池
          </button>
        </div>
        {isAdmin ? (
          <select
            className="sidebar-user-select"
            value={activeUserId || ''}
            onChange={(event) => onUserChange(Number(event.target.value || 0))}
          >
            <option value="">全部用户</option>
            {users.filter((item) => item.role !== 'admin').map((user) => (
              <option key={user.id} value={user.id}>{user.username}</option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="sidebar-search">
        <div className="sidebar-search__row">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={scope === 'consumed' ? '搜索已消费邮箱' : '搜索账号池邮箱'}
          />
          <select className="sidebar-site-select" value={selectedSiteCode} onChange={(event) => onSiteChange(event.target.value)}>
            {sites.map((site) => (
              <option key={site.id} value={site.code}>{site.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="sidebar-list sidebar-list--accounts">
        {groups.map((group) => (
          <section key={group.key} className="sidebar-group">
            <div className="sidebar-group__header">
              <div>
                <strong>{group.title}</strong>
                <span>{group.hint}</span>
              </div>
              <span className={`sidebar-group__badge ${group.accent}`}>{group.accounts.length}</span>
            </div>
            <div className="sidebar-group__items">
              {group.accounts.map((account) => renderAccountItem(account))}
            </div>
          </section>
        ))}
        {accounts.length === 0 ? <div className="empty-block">{emptyText}</div> : null}
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
