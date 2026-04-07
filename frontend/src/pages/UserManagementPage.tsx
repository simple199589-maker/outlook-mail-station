import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import './user-management.css'

import { ImportAccountsModal } from '@/components/ImportAccountsModal'
import { UserAccountManagementModal } from '@/components/UserAccountManagementModal'
import { UserApiKeyModal } from '@/components/UserApiKeyModal'
import { UserManagementPanel } from '@/components/UserManagementPanel'
import {
  copyText,
  clearAdminToken,
  createUser,
  exportAccounts,
  fetchAccounts,
  fetchUserApiKey,
  fetchUsers,
  formatTime,
  importAccounts,
  moveAccountsToUserPool,
  regenerateUserApiKey,
  updateAccountsEnabled,
  updateUser,
} from '@/lib/api'
import { AccountItem, UserApiKeyPayload, UserItem } from '@/types'

const ACCOUNT_PAGE_SIZE = 12

/**
 * AI by zb: 用户管理页面，负责用户创建、启停与导入邮箱到用户池。
 */
export function UserManagementPage() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null)
  const [users, setUsers] = useState<UserItem[]>([])
  const [activeUserId, setActiveUserId] = useState<number | null>(null)
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [accountTotal, setAccountTotal] = useState(0)
  const [accountPage, setAccountPage] = useState(1)
  const [accountTotalPages, setAccountTotalPages] = useState(1)
  const [accountScope, setAccountScope] = useState<'all' | 'pool' | 'consumed'>('all')
  const [accountKeywordInput, setAccountKeywordInput] = useState('')
  const [accountKeyword, setAccountKeyword] = useState('')
  const [accountBatchInput, setAccountBatchInput] = useState('')
  const [accountBatch, setAccountBatch] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [transferTargetUserId, setTransferTargetUserId] = useState<number>(0)
  const [createUserName, setCreateUserName] = useState('')
  const [createUserPassword, setCreateUserPassword] = useState('')
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [managePanelOpen, setManagePanelOpen] = useState(false)
  const [apiKeyUserId, setApiKeyUserId] = useState<number | null>(null)
  const [activeAccount, setActiveAccount] = useState<AccountItem | null>(null)
  const [activeUserApiKey, setActiveUserApiKey] = useState<UserApiKeyPayload | null>(null)
  const [importText, setImportText] = useState('')
  const [importBatch, setImportBatch] = useState('')
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const [apiKeyLoading, setApiKeyLoading] = useState(false)
  const [apiKeyCopied, setApiKeyCopied] = useState(false)

  const visibleUsers = useMemo(() => users.filter((item) => item.role !== 'admin'), [users])
  const isAdmin = currentUser?.role === 'admin'
  const activeUser = visibleUsers.find((item) => item.id === activeUserId) || null
  const apiKeyUser = visibleUsers.find((item) => item.id === apiKeyUserId) || null
  const enabledUserCount = useMemo(() => visibleUsers.filter((item) => item.enabled).length, [visibleUsers])
  const totalPoolCount = useMemo(() => visibleUsers.reduce((sum, item) => sum + item.pool_count, 0), [visibleUsers])
  const totalConsumedCount = useMemo(() => visibleUsers.reduce((sum, item) => sum + item.consumed_count, 0), [visibleUsers])
  const disabledUserCount = Math.max(visibleUsers.length - enabledUserCount, 0)
  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedAccountIds.includes(account.id)),
    [accounts, selectedAccountIds],
  )
  const hasSelectedAccounts = selectedAccountIds.length > 0
  const allVisibleSelected = accounts.length > 0 && selectedAccountIds.length === accounts.length
  const batchActionLabel = selectedAccounts.length ? `已选 ${selectedAccounts.length} 项` : '未选择账户'
  const availableBatchCodes = useMemo(
    () => Array.from(new Set(accounts.map((account) => account.batch_code.trim()).filter(Boolean))),
    [accounts],
  )
  const transferCandidates = useMemo(
    () => visibleUsers.filter((item) => item.enabled && item.id !== activeUserId),
    [visibleUsers, activeUserId],
  )

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    if (!activeUserId) {
      setAccounts([])
      setAccountTotal(0)
      setAccountTotalPages(1)
      setSelectedAccountIds([])
      setTransferTargetUserId(0)
      setManagePanelOpen(false)
      setApiKeyUserId(null)
      setActiveAccount(null)
      setActiveUserApiKey(null)
      setApiKeyCopied(false)
      return
    }
    void loadUserAccounts(activeUserId)
  }, [activeUserId, accountPage, accountScope, accountKeyword, accountBatch])

  useEffect(() => {
    if (!apiKeyUserId) {
      setActiveUserApiKey(null)
      setApiKeyCopied(false)
      return
    }
    void loadUserApiKey(apiKeyUserId)
  }, [apiKeyUserId])

  useEffect(() => {
    if (!transferCandidates.length) {
      setTransferTargetUserId(0)
      return
    }
    if (!transferCandidates.some((item) => item.id === transferTargetUserId)) {
      setTransferTargetUserId(transferCandidates[0].id)
    }
  }, [transferCandidates, transferTargetUserId])

  /**
   * AI by zb: 初始化用户列表并自动定位默认目标用户。
   */
  const bootstrap = async () => {
    setError('')
    try {
      const userResponse = await fetchUsers()
      setUsers(userResponse.items)
      const me = userResponse.items[0] || null
      setCurrentUser(me)
      const defaultUserId = me?.role === 'admin'
        ? userResponse.items.find((item) => item.role !== 'admin')?.id || null
        : me?.id || null
      setActiveUserId(defaultUserId)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }

  /**
   * AI by zb: 刷新用户列表并同步当前登录用户信息。
   */
  const refreshUsers = async () => {
    const response = await fetchUsers()
    setUsers(response.items)
    if (!currentUser) {
      return
    }
    const nextCurrent = response.items.find((item) => item.id === currentUser.id) || currentUser
    setCurrentUser(nextCurrent)
  }

  /**
   * AI by zb: 加载当前选中用户下的账户表格数据。
   */
  const loadUserAccounts = async (userId: number) => {
    try {
      const response = await fetchAccounts({
        page: accountPage,
        pageSize: ACCOUNT_PAGE_SIZE,
        keyword: accountKeyword,
        scope: accountScope,
        batchCode: accountBatch,
        userId,
      })
      setAccounts(response.items)
      setAccountTotal(response.total)
      setAccountTotalPages(response.total_pages)
      setSelectedAccountIds([])
      setActiveAccount((current) => current ? response.items.find((item) => item.id === current.id) || null : null)
    } catch {
      setAccounts([])
      setAccountTotal(0)
      setAccountTotalPages(1)
      setSelectedAccountIds([])
      setActiveAccount(null)
    }
  }

  /**
   * AI by zb: 创建新的普通用户。
   */
  const handleCreateUser = async () => {
    if (!createUserName.trim() || !createUserPassword.trim()) {
      setError('请输入用户名和密码')
      return
    }
    setActionLoading('user')
    setError('')
    try {
      await createUser({ username: createUserName, password: createUserPassword, role: 'user', enabled: true })
      setCreateUserName('')
      setCreateUserPassword('')
      setCreateUserOpen(false)
      await refreshUsers()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    } finally {
      setActionLoading('')
    }
  }

  /**
   * AI by zb: 切换用户启用状态。
   */
  const handleToggleUserEnabled = async (user: UserItem) => {
    setActionLoading(`user-${user.id}`)
    setError('')
    try {
      await updateUser(user.id, { enabled: !user.enabled })
      await refreshUsers()
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError))
    } finally {
      setActionLoading('')
    }
  }

  /**
   * AI by zb: 加载当前用户对应的开放接口 API Key。
   */
  const loadUserApiKey = async (userId: number) => {
    setApiKeyLoading(true)
    setApiKeyCopied(false)
    try {
      const payload = await fetchUserApiKey(userId)
      setActiveUserApiKey(payload)
    } catch (apiKeyError) {
      setActiveUserApiKey(null)
      setError(apiKeyError instanceof Error ? apiKeyError.message : String(apiKeyError))
    } finally {
      setApiKeyLoading(false)
    }
  }

  /**
   * AI by zb: 打开当前用户的全屏账户管理弹窗。
   */
  const handleOpenUserDetail = (userId: number) => {
    setActiveUserId(userId)
    setAccountPage(1)
    setAccountKeyword('')
    setAccountKeywordInput('')
    setAccountBatch('')
    setAccountBatchInput('')
    setAccountScope('all')
    setManagePanelOpen(true)
  }

  /**
   * AI by zb: 打开指定用户的 API Key 管理弹窗。
   */
  const handleOpenUserApiKey = (userId: number) => {
    setApiKeyUserId(userId)
    setError('')
  }

  /**
   * AI by zb: 复制当前用户的开放接口 API Key。
   */
  const handleCopyUserApiKey = async () => {
    if (!activeUserApiKey?.api_key) {
      return
    }
    try {
      await copyText(activeUserApiKey.api_key)
      setApiKeyCopied(true)
      window.setTimeout(() => setApiKeyCopied(false), 1500)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError))
    }
  }

  /**
   * AI by zb: 重新生成当前用户的开放接口 API Key。
   */
  const handleRegenerateUserApiKey = async () => {
    if (!apiKeyUserId) {
      setError('请先选择一个用户')
      return
    }
    if (!window.confirm('重置后旧 API Key 会立即失效，确认继续吗？')) {
      return
    }
    setActionLoading('user-api-key')
    setError('')
    try {
      const payload = await regenerateUserApiKey(apiKeyUserId)
      setActiveUserApiKey(payload)
      setApiKeyCopied(false)
    } catch (apiKeyError) {
      setError(apiKeyError instanceof Error ? apiKeyError.message : String(apiKeyError))
    } finally {
      setActionLoading('')
    }
  }

  /**
   * AI by zb: 将批量邮箱导入当前选中用户池。
   */
  const handleImport = async () => {
    if (!activeUserId) {
      setError('请先选择一个用户再导入邮箱')
      return
    }
    setActionLoading('import')
    setError('')
    try {
      await importAccounts({ data: importText, batch_code: importBatch, owner_user_id: activeUserId })
      setImportText('')
      setImportBatch('')
      setImportOpen(false)
      await refreshUsers()
      await loadUserAccounts(activeUserId)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError))
    } finally {
      setActionLoading('')
    }
  }

  /**
   * AI by zb: 导出当前筛选条件下的邮箱统计数据。
   */
  const handleExportAccounts = async () => {
    if (!activeUserId) {
      setError('请先选择一个用户再导出邮箱')
      return
    }
    setActionLoading('export')
    setError('')
    try {
      const { blob, filename } = await exportAccounts({
        userId: activeUserId,
        scope: accountScope,
        keyword: accountKeyword,
        batchCode: accountBatch,
      })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError))
    } finally {
      setActionLoading('')
    }
  }

  /**
   * AI by zb: 提交关键词与批次查询并重置分页。
   */
  const handleSearchSubmit = () => {
    setAccountPage(1)
    setAccountKeyword(accountKeywordInput.trim())
    setAccountBatch(accountBatchInput.trim())
  }

  /**
   * AI by zb: 清空当前账户筛选条件。
   */
  const handleResetFilters = () => {
    setAccountPage(1)
    setAccountScope('all')
    setAccountKeywordInput('')
    setAccountKeyword('')
    setAccountBatchInput('')
    setAccountBatch('')
  }

  /**
   * AI by zb: 切换账户作用域筛选。
   */
  const handleChangeScope = (scope: 'all' | 'pool' | 'consumed') => {
    setAccountScope(scope)
    setAccountPage(1)
  }

  /**
   * AI by zb: 切换单个账户的批量选择状态。
   */
  const handleToggleAccountSelection = (accountId: number) => {
    setSelectedAccountIds((current) => current.includes(accountId)
      ? current.filter((id) => id !== accountId)
      : [...current, accountId])
  }

  /**
   * AI by zb: 切换当前表格全部账户的选择状态。
   */
  const handleToggleAllAccounts = () => {
    if (!accounts.length) {
      return
    }
    setSelectedAccountIds(allVisibleSelected ? [] : accounts.map((account) => account.id))
  }

  /**
   * AI by zb: 打开单个账户的查询弹窗。
   */
  const handleOpenAccountQuery = (account: AccountItem) => {
    setActiveAccount(account)
  }

  /**
   * AI by zb: 关闭单个账户的查询弹窗。
   */
  const handleCloseAccountQuery = () => {
    setActiveAccount(null)
  }

  /**
   * AI by zb: 批量更新当前勾选邮箱的启停状态。
   */
  const handleBatchUpdateEnabled = async (enabled: boolean) => {
    if (!activeUserId) {
      setError('请先选择一个用户')
      return
    }
    if (!selectedAccountIds.length) {
      setError('请先勾选至少一个邮箱')
      return
    }
    setActionLoading(enabled ? 'batch-enable' : 'batch-disable')
    setError('')
    try {
      await updateAccountsEnabled(selectedAccountIds, enabled)
      await refreshUsers()
      await loadUserAccounts(activeUserId)
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : String(batchError))
    } finally {
      setActionLoading('')
    }
  }

  /**
   * AI by zb: 将当前勾选邮箱批量转移到其他用户池。
   */
  const handleBatchMoveAccounts = async () => {
    if (!activeUserId) {
      setError('请先选择一个用户')
      return
    }
    if (!selectedAccountIds.length) {
      setError('请先勾选至少一个邮箱')
      return
    }
    if (!transferTargetUserId) {
      setError('请选择转移目标用户')
      return
    }
    setActionLoading('batch-move')
    setError('')
    try {
      await moveAccountsToUserPool({ account_ids: selectedAccountIds, owner_user_id: transferTargetUserId })
      setSelectedAccountIds([])
      await refreshUsers()
      await loadUserAccounts(activeUserId)
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : String(moveError))
    } finally {
      setActionLoading('')
    }
  }

  if (currentUser && !isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="station-layout station-layout--users">
      <section className="user-page-hero">
        <header className="station-header station-header--users user-page-header">
          <div className="station-header__content user-page-header__content">
            <span className="section-kicker user-page-header__brand">OUTLOOK MAIL STATION</span>
            <h1>用户管理</h1>
            <div className="station-header__meta user-page-header__meta">
              <span className="status-pill is-good">已启用 {enabledUserCount} 个用户</span>
              <span className="status-pill is-muted">当前目标 {activeUser?.username || '未选择用户'}</span>
              <span className="status-pill is-muted">待处理 {disabledUserCount} 个账号池</span>
            </div>
          </div>
          <div className="user-page-header__actions">
            <div className="user-page-header__secondary-actions">
              <button className="ghost-button user-page-header__secondary-button" type="button" onClick={() => navigate('/')}>
                返回工作台
              </button>
              <button
                className="ghost-button user-page-header__secondary-button user-page-header__logout-button"
                type="button"
                onClick={() => { clearAdminToken(); window.location.replace('/login') }}
              >
                退出登录
              </button>
            </div>
          </div>
        </header>

        <section className="metrics-panel metrics-panel--hero" aria-label="用户池概览">
          <article className="metric-card metric-card--primary">
            <span className="metric-card__label">用户总数</span>
            <strong className="metric-card__value">{visibleUsers.length}</strong>
          </article>
          <article className="metric-card metric-card--neutral">
            <span className="metric-card__label">池内邮箱总量</span>
            <strong className="metric-card__value">{totalPoolCount}</strong>
          </article>
          <article className="metric-card metric-card--success">
            <span className="metric-card__label">已消费总量</span>
            <strong className="metric-card__value">{totalConsumedCount}</strong>
          </article>
        </section>
      </section>

      {error ? <div className="public-error">{error}</div> : null}

      <div className="dashboard-grid user-management-grid user-management-grid--admin user-management-grid--single">
        <UserManagementPanel
          users={visibleUsers}
          activeUserId={activeUserId}
          actionLoading={actionLoading}
          onCreateUser={() => setCreateUserOpen(true)}
          onOpenUserApiKey={handleOpenUserApiKey}
          onToggleUserEnabled={handleToggleUserEnabled}
          onSelectUser={(userId) => {
            setActiveUserId(userId)
            setAccountPage(1)
            setAccountKeyword('')
            setAccountKeywordInput('')
            setAccountBatch('')
            setAccountBatchInput('')
            setAccountScope('all')
          }}
          onOpenUserDetail={handleOpenUserDetail}
        />
      </div>

      <UserAccountManagementModal
        open={managePanelOpen && Boolean(activeUser)}
        username={activeUser?.username || ''}
        onClose={() => setManagePanelOpen(false)}
        onOpenImport={() => setImportOpen(true)}
        onExport={handleExportAccounts}
        exportBusy={actionLoading === 'export'}
        scope={accountScope}
        keywordInput={accountKeywordInput}
        batchInput={accountBatchInput}
        availableBatchCodes={availableBatchCodes}
        onScopeChange={handleChangeScope}
        onKeywordInputChange={setAccountKeywordInput}
        onBatchInputChange={setAccountBatchInput}
        onSearchSubmit={handleSearchSubmit}
        onResetFilters={handleResetFilters}
        hasSelectedAccounts={hasSelectedAccounts}
        selectionLabel={batchActionLabel}
        selectionHint={accountKeyword ? `关键词：${accountKeyword}` : '支持批量启停与转移'}
        onBatchEnable={() => void handleBatchUpdateEnabled(true)}
        onBatchDisable={() => void handleBatchUpdateEnabled(false)}
        batchEnableBusy={actionLoading === 'batch-enable'}
        batchDisableBusy={actionLoading === 'batch-disable'}
        allowTransfer
        transferTargetUserId={transferTargetUserId}
        transferCandidates={transferCandidates}
        onTransferTargetChange={setTransferTargetUserId}
        onBatchMove={() => void handleBatchMoveAccounts()}
        batchMoveBusy={actionLoading === 'batch-move'}
        accounts={accounts}
        selectedAccountIds={selectedAccountIds}
        allVisibleSelected={allVisibleSelected}
        onToggleAllAccounts={handleToggleAllAccounts}
        onToggleAccountSelection={handleToggleAccountSelection}
        onOpenAccountQuery={handleOpenAccountQuery}
        accountPage={accountPage}
        accountTotalPages={accountTotalPages}
        accountTotal={accountTotal}
        onPrevPage={() => setAccountPage((current) => Math.max(current - 1, 1))}
        onNextPage={() => setAccountPage((current) => Math.min(current + 1, accountTotalPages))}
      />

      <UserApiKeyModal
        open={Boolean(apiKeyUser)}
        username={apiKeyUser?.username || ''}
        apiKey={activeUserApiKey?.api_key || ''}
        updatedAt={activeUserApiKey?.updated_at}
        loading={apiKeyLoading}
        copied={apiKeyCopied}
        busy={actionLoading === 'user-api-key'}
        onClose={() => setApiKeyUserId(null)}
        onCopy={() => void handleCopyUserApiKey()}
        onRegenerate={() => void handleRegenerateUserApiKey()}
      />

      {activeAccount ? (
        <div className="shell-modal__backdrop" onClick={handleCloseAccountQuery}>
          <div className="shell-modal shell-modal--compact user-account-query-modal" onClick={(event) => event.stopPropagation()}>
            <div className="shell-modal__header user-import-modal__header">
              <div>
                <span className="section-kicker">账号查询</span>
                <h3>{activeAccount.email}</h3>
                <p>查看当前邮箱的归属、批次、站点使用与收发统计。</p>
              </div>
              <button className="icon-close-button shell-modal__close" type="button" onClick={handleCloseAccountQuery} aria-label="关闭账号查询弹窗">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="user-account-query-modal__body">
              <div className="user-account-query-modal__grid">
                <div>
                  <span>邮箱</span>
                  <strong>{activeAccount.email}</strong>
                </div>
                <div>
                  <span>归属用户</span>
                  <strong>{activeAccount.owner_username || activeUser?.username || '-'}</strong>
                </div>
                <div>
                  <span>当前状态</span>
                  <strong>{activeAccount.enabled ? '启用' : '禁用'}</strong>
                </div>
                <div>
                  <span>账户类型</span>
                  <strong>{activeAccount.is_consumed ? '已消费' : '池内'}</strong>
                </div>
                <div>
                  <span>批次</span>
                  <strong>{activeAccount.batch_code || '默认批次'}</strong>
                </div>
                <div>
                  <span>收件数</span>
                  <strong>{activeAccount.inbox_count}</strong>
                </div>
                <div>
                  <span>发件数</span>
                  <strong>{activeAccount.sent_count}</strong>
                </div>
                <div>
                  <span>使用站点</span>
                  <strong>{activeAccount.active_sites.length ? activeAccount.active_sites.map((site) => site.site_name).join(' / ') : '无'}</strong>
                </div>
              </div>
            </div>
            <div className="shell-modal__footer">
              <button className="gradient-button" type="button" onClick={handleCloseAccountQuery}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createUserOpen ? (
        <div className="shell-modal__backdrop" onClick={() => setCreateUserOpen(false)}>
          <div className="shell-modal shell-modal--compact user-create-modal" onClick={(event) => event.stopPropagation()}>
            <div className="shell-modal__header user-create-modal__header">
              <div className="user-create-modal__title">
                <span className="section-kicker">新增用户</span>
                <h3>创建新的邮箱池归属用户</h3>
                <p>创建后即可把导入邮箱直接分配到该用户名下，作为独立池进行维护。</p>
              </div>
              <button className="icon-close-button shell-modal__close" type="button" onClick={() => setCreateUserOpen(false)} aria-label="关闭新增用户弹窗">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="shell-modal__body user-create-modal__body">
              <div className="user-create-modal__intro">
                <strong>创建后可直接接收批量导入邮箱</strong>
                <span>适合按人员拆分独立邮箱池，后续可单独查看、启停和维护。</span>
              </div>
              <div className="user-create-modal__form">
                <label className="user-create-modal__field" htmlFor="create-user-name">
                  <span>用户名</span>
                  <input
                    id="create-user-name"
                    value={createUserName}
                    onChange={(event) => setCreateUserName(event.target.value)}
                    placeholder="请输入用户名"
                    autoComplete="username"
                  />
                  <small>建议使用便于识别的成员名或业务标识。</small>
                </label>
                <label className="user-create-modal__field" htmlFor="create-user-password">
                  <span>登录密码</span>
                  <input
                    id="create-user-password"
                    value={createUserPassword}
                    onChange={(event) => setCreateUserPassword(event.target.value)}
                    placeholder="请输入登录密码"
                    type="password"
                    autoComplete="new-password"
                  />
                  <small>创建后该用户可使用此密码登录并维护自己的邮箱池。</small>
                </label>
              </div>
            </div>
            <div className="shell-modal__footer user-create-modal__footer">
              <span className="user-create-modal__footer-note">创建后可继续导入邮箱到该用户池。</span>
              <div className="user-create-modal__footer-actions">
                <button className="ghost-button" type="button" onClick={() => setCreateUserOpen(false)}>
                  取消
                </button>
                <button className="gradient-button" type="button" onClick={handleCreateUser} disabled={actionLoading === 'user'}>
                  {actionLoading === 'user' ? '创建中...' : '确认新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ImportAccountsModal
        open={importOpen}
        title={`导入到 ${activeUser?.username || '当前用户池'}`}
        description="每行一条账户记录，支持批量粘贴后一次性导入到当前用户池。"
        targetName={activeUser?.username || '未选择'}
        targetStatus={activeUser?.enabled ? '当前状态可导入' : '当前状态待启用'}
        value={importText}
        onValueChange={setImportText}
        batchValue={importBatch}
        onBatchValueChange={setImportBatch}
        placeholder="示例：example@outlook.com----password----client_id----refresh_token"
        onClose={() => setImportOpen(false)}
        onSubmit={handleImport}
        submitting={actionLoading === 'import'}
        submitLabel="确认导入"
        loadingLabel="导入中..."
      />
    </div>
  )
}
