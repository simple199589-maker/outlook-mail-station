import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AccountSidebar } from '@/components/AccountSidebar'
import { ImportAccountsModal } from '@/components/ImportAccountsModal'
import { MessageDetailModal } from '@/components/MessageDetailModal'
import { MessageList } from '@/components/MessageList'
import { ShellModal } from '@/components/ShellModal'
import { ToastMessage, ToastStack } from '@/components/ToastStack'
import { UserAccountManagementModal } from '@/components/UserAccountManagementModal'
import { UserApiKeyModal } from '@/components/UserApiKeyModal'
import {
  apiFetch,
  clearAdminToken,
  createSite,
  consumeAccount,
  consumeRandomPoolAccount,
  copyText,
  deleteAccount,
  exportAccounts,
  fetchAccounts,
  fetchPoolSummary,
  fetchUserApiKey,
  fetchSites,
  fetchUsers,
  formatTime,
  importAccounts,
  regenerateUserApiKey,
  releaseAccount,
  updateSite,
  updateAccountsEnabled,
  updateAccount,
} from '@/lib/api'
import {
  AccountDetail,
  AccountItem,
  ImportResult,
  MessageDetail,
  MessageItem,
  PoolSummary,
  ShareResult,
  SiteItem,
  UserApiKeyPayload,
  UserItem,
} from '@/types'

const AUTO_REFRESH_SECONDS = 10
const ACCOUNT_PAGE_SIZE = 5
const MANAGE_ACCOUNT_PAGE_SIZE = 12
const SELECTED_SITE_STORAGE_KEY = 'oms_selected_site_code'

/**
 * AI by zb: Outlook 邮件站主页面。
 */
export function MailStationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [accountTotal, setAccountTotal] = useState(0)
  const [accountPage, setAccountPage] = useState(1)
  const [accountTotalPages, setAccountTotalPages] = useState(1)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AccountDetail | null>(null)
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox')
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null)
  const [messageOpen, setMessageOpen] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS)
  const [busyAction, setBusyAction] = useState('')
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const [currentUser, setCurrentUser] = useState<UserItem | null>(null)
  const [users, setUsers] = useState<UserItem[]>([])
  const [activeUserId, setActiveUserId] = useState<number | null>(null)
  const [scope, setScope] = useState<'consumed' | 'pool'>('consumed')
  const [poolSummary, setPoolSummary] = useState<PoolSummary | null>(null)
  const [releasingId, setReleasingId] = useState<number | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importValue, setImportValue] = useState('')
  const [importBatch, setImportBatch] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [selfManageOpen, setSelfManageOpen] = useState(false)
  const [manageAccounts, setManageAccounts] = useState<AccountItem[]>([])
  const [manageAccountTotal, setManageAccountTotal] = useState(0)
  const [manageAccountPage, setManageAccountPage] = useState(1)
  const [manageAccountTotalPages, setManageAccountTotalPages] = useState(1)
  const [manageAccountScope, setManageAccountScope] = useState<'all' | 'pool' | 'consumed'>('all')
  const [manageAccountKeywordInput, setManageAccountKeywordInput] = useState('')
  const [manageAccountKeyword, setManageAccountKeyword] = useState('')
  const [manageAccountBatchInput, setManageAccountBatchInput] = useState('')
  const [manageAccountBatch, setManageAccountBatch] = useState('')
  const [manageSelectedAccountIds, setManageSelectedAccountIds] = useState<number[]>([])
  const [manageActiveAccount, setManageActiveAccount] = useState<AccountItem | null>(null)
  const [selfApiKeyOpen, setSelfApiKeyOpen] = useState(false)
  const [selfUserApiKey, setSelfUserApiKey] = useState<UserApiKeyPayload | null>(null)
  const [selfApiKeyLoading, setSelfApiKeyLoading] = useState(false)
  const [selfApiKeyCopied, setSelfApiKeyCopied] = useState(false)

  const [sendOpen, setSendOpen] = useState(false)
  const [sendForm, setSendForm] = useState({ to: '', cc: '', bcc: '', subject: '', body_text: '', body_html: '' })

  const [shareOpen, setShareOpen] = useState(false)
  const [shareDays, setShareDays] = useState(30)
  const [shareResult, setShareResult] = useState<ShareResult | null>(null)
  const [sites, setSites] = useState<SiteItem[]>([])
  const [sitesLoaded, setSitesLoaded] = useState(false)
  const [selectedSiteCode, setSelectedSiteCode] = useState('')
  const [siteModalOpen, setSiteModalOpen] = useState(false)
  const [siteQuery, setSiteQuery] = useState('')
  const [sitePage, setSitePage] = useState(1)
  const [siteCode, setSiteCode] = useState('')
  const [siteName, setSiteName] = useState('')
  const [editingSiteId, setEditingSiteId] = useState<number | null>(null)
  const [consumeTarget, setConsumeTarget] = useState<AccountItem | null>(null)
  const [consumeSiteCode, setConsumeSiteCode] = useState('')
  const [releaseTarget, setReleaseTarget] = useState<AccountItem | null>(null)
  const [releaseSiteCode, setReleaseSiteCode] = useState('')
  const [pinningId, setPinningId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AccountItem | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const requestedAccountId = Number(searchParams.get('accountId') || '') || null
  const isAdmin = currentUser?.role === 'admin'
  const sidebarUsers = useMemo(() => users.filter((item) => item.role !== 'admin'), [users])
  const currentWorkspaceLabel = useMemo(() => {
    if (!isAdmin) {
      return currentUser?.username || '未选择用户'
    }
    if (!activeUserId) {
      return '全部用户'
    }
    return sidebarUsers.find((item) => item.id === activeUserId)?.username || '未选择用户'
  }, [activeUserId, currentUser, isAdmin, sidebarUsers])
  const enabledSites = useMemo(() => sites.filter((site) => site.enabled), [sites])
  const selectedSite = useMemo(
    () => enabledSites.find((site) => site.code === selectedSiteCode) || enabledSites[0] || null,
    [enabledSites, selectedSiteCode],
  )
  const manageAvailableBatchCodes = useMemo(
    () => Array.from(new Set(manageAccounts.map((account) => account.batch_code.trim()).filter(Boolean))),
    [manageAccounts],
  )
  const manageSelectedAccounts = useMemo(
    () => manageAccounts.filter((account) => manageSelectedAccountIds.includes(account.id)),
    [manageAccounts, manageSelectedAccountIds],
  )
  const manageHasSelectedAccounts = manageSelectedAccountIds.length > 0
  const manageAllVisibleSelected = manageAccounts.length > 0 && manageSelectedAccountIds.length === manageAccounts.length
  const manageBatchActionLabel = manageSelectedAccounts.length ? `已选 ${manageSelectedAccounts.length} 项` : '未选择账户'
  const filteredSites = useMemo(() => {
    const keyword = siteQuery.trim().toLowerCase()
    if (!keyword) {
      return sites
    }
    return sites.filter((site) => (
      site.code.toLowerCase().includes(keyword)
      || site.name.toLowerCase().includes(keyword)
    ))
  }, [siteQuery, sites])
  const sitePageSize = 6
  const siteTotalPages = Math.max(1, Math.ceil(filteredSites.length / sitePageSize))
  const visibleSites = useMemo(() => {
    const safePage = Math.min(sitePage, siteTotalPages)
    const start = (safePage - 1) * sitePageSize
    return filteredSites.slice(start, start + sitePageSize)
  }, [filteredSites, sitePage, siteTotalPages])

  /**
   * AI by zb: 显示统一浮动提示消息。
   */
  const flash = (type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current.slice(-3), { id, type, text }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 2600)
  }

  /**
   * AI by zb: 根据当前角色和选中用户加载邮箱列表。
   */
  const loadAccounts = async (
    preferredId?: number | null,
    requestedPage = accountPage,
    options?: { scopeOverride?: 'consumed' | 'pool'; queryOverride?: string },
  ) => {
    const effectiveScope = options?.scopeOverride ?? scope
    const effectiveQuery = options?.queryOverride ?? query
    const response = await fetchAccounts({
      page: requestedPage,
      pageSize: ACCOUNT_PAGE_SIZE,
      keyword: effectiveQuery,
      scope: effectiveScope,
      siteCode: selectedSiteCode,
      userId: isAdmin ? activeUserId : currentUser?.id,
    })
    const list = response.items
    setAccounts(list)
    setAccountTotal(response.total)
    setAccountTotalPages(response.total_pages)
    if (response.page !== accountPage) {
      setAccountPage(response.page)
    }
    const nextId = preferredId ?? requestedAccountId ?? selectedId
    if (list.length === 0) {
      setSelectedId(null)
      setDetail(null)
      setMessages([])
      setSelectedMessage(null)
      return
    }
    if (!nextId || !list.some((item) => item.id === nextId)) {
      setSelectedId(list[0].id)
      return
    }
    setSelectedId(nextId)
  }

  /**
   * AI by zb: 加载当前目标用户的邮箱池摘要。
   */
  const loadPoolSummary = async () => {
    try {
      const summary = await fetchPoolSummary(isAdmin ? activeUserId : currentUser?.id, selectedSiteCode)
      setPoolSummary(summary)
    } catch {
      setPoolSummary(null)
    }
  }

  /**
   * AI by zb: 初始化当前登录用户与可切换用户。
   */
  const bootstrapUsers = async () => {
    const response = await fetchUsers()
    const list = response.items
    setUsers(list)
    const me = list[0] || null
    setCurrentUser(me)
    if (!me) {
      setActiveUserId(null)
      return
    }
    if (me.role === 'admin') {
      const defaultUserId = list.find((item) => item.role !== 'admin')?.id || null
      setActiveUserId(defaultUserId)
      return
    }
    setActiveUserId(me.id)
  }

  /**
   * AI by zb: 加载站点配置列表，供手动使用与退回操作选择。
   */
  const loadSites = async () => {
    try {
      const response = await fetchSites()
      setSites(response.items)
    } finally {
      setSitesLoaded(true)
    }
  }

  /**
   * AI by zb: 加载当前普通用户在详情弹窗中的邮箱列表。
   */
  const loadManageAccounts = async (requestedPage = manageAccountPage) => {
    if (!currentUser) {
      return
    }
    const response = await fetchAccounts({
      page: requestedPage,
      pageSize: MANAGE_ACCOUNT_PAGE_SIZE,
      keyword: manageAccountKeyword,
      scope: manageAccountScope,
      batchCode: manageAccountBatch,
      userId: currentUser.id,
    })
    setManageAccounts(response.items)
    setManageAccountTotal(response.total)
    setManageAccountTotalPages(response.total_pages)
    if (response.page !== manageAccountPage) {
      setManageAccountPage(response.page)
    }
    setManageSelectedAccountIds([])
    setManageActiveAccount((current) => current ? response.items.find((item) => item.id === current.id) || null : null)
  }

  /**
   * AI by zb: 打开普通用户自己的邮箱详情弹窗。
   */
  const openCurrentUserManageModal = () => {
    setManageAccountPage(1)
    setManageAccountScope('all')
    setManageAccountKeywordInput('')
    setManageAccountKeyword('')
    setManageAccountBatchInput('')
    setManageAccountBatch('')
    setManageSelectedAccountIds([])
    setManageActiveAccount(null)
    setSelfManageOpen(true)
  }

  /**
   * AI by zb: 加载当前普通用户自己的 API Key。
   */
  const loadSelfUserApiKey = async () => {
    if (!currentUser) {
      return
    }
    setSelfApiKeyLoading(true)
    setSelfApiKeyCopied(false)
    try {
      const payload = await fetchUserApiKey(currentUser.id)
      setSelfUserApiKey(payload)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setSelfApiKeyLoading(false)
    }
  }

  /**
   * AI by zb: 打开当前普通用户自己的 API Key 弹窗并加载最新值。
   */
  const openCurrentUserApiKeyModal = async () => {
    if (!currentUser) {
      return
    }
    setSelfApiKeyOpen(true)
    await loadSelfUserApiKey()
  }

  /**
   * AI by zb: 提交普通用户详情弹窗中的筛选条件。
   */
  const handleManageSearchSubmit = () => {
    setManageAccountPage(1)
    setManageAccountKeyword(manageAccountKeywordInput.trim())
    setManageAccountBatch(manageAccountBatchInput.trim())
  }

  /**
   * AI by zb: 重置普通用户详情弹窗中的筛选条件。
   */
  const handleManageResetFilters = () => {
    setManageAccountPage(1)
    setManageAccountScope('all')
    setManageAccountKeywordInput('')
    setManageAccountKeyword('')
    setManageAccountBatchInput('')
    setManageAccountBatch('')
  }

  /**
   * AI by zb: 切换普通用户详情弹窗中的账户范围。
   */
  const handleManageChangeScope = (nextScope: 'all' | 'pool' | 'consumed') => {
    setManageAccountScope(nextScope)
    setManageAccountPage(1)
  }

  /**
   * AI by zb: 切换普通用户详情弹窗中的批量勾选状态。
   */
  const handleToggleManageAccountSelection = (accountId: number) => {
    setManageSelectedAccountIds((current) => current.includes(accountId)
      ? current.filter((id) => id !== accountId)
      : [...current, accountId])
  }

  /**
   * AI by zb: 切换普通用户详情弹窗当前页全部勾选状态。
   */
  const handleToggleAllManageAccounts = () => {
    if (!manageAccounts.length) {
      return
    }
    setManageSelectedAccountIds(manageAllVisibleSelected ? [] : manageAccounts.map((account) => account.id))
  }

  /**
   * AI by zb: 批量更新普通用户邮箱启停状态。
   */
  const handleManageBatchUpdateEnabled = async (enabled: boolean) => {
    if (!manageSelectedAccountIds.length) {
      flash('error', '请先勾选至少一个邮箱')
      return
    }
    setBusyAction(enabled ? 'manage-batch-enable' : 'manage-batch-disable')
    try {
      await updateAccountsEnabled(manageSelectedAccountIds, enabled)
      await loadManageAccounts()
      await loadAccounts(undefined, accountPage)
      await loadPoolSummary()
      if (selectedId) {
        await loadDetail(selectedId).catch(() => {})
      }
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 导出普通用户详情弹窗当前筛选范围的邮箱 CSV。
   */
  const handleManageExportAccounts = async () => {
    if (!currentUser) {
      return
    }
    setBusyAction('manage-export')
    try {
      const { blob, filename } = await exportAccounts({
        userId: currentUser.id,
        scope: manageAccountScope,
        keyword: manageAccountKeyword,
        batchCode: manageAccountBatch,
      })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 打开普通用户自己的 API Key 弹窗并加载最新值。
   */
  const handleCopySelfApiKey = async () => {
    if (!selfUserApiKey?.api_key) {
      return
    }
    try {
      await copyText(selfUserApiKey.api_key)
      setSelfApiKeyCopied(true)
      window.setTimeout(() => setSelfApiKeyCopied(false), 1500)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * AI by zb: 重置普通用户自己的 API Key。
   */
  const handleRegenerateSelfApiKey = async () => {
    if (!currentUser) {
      return
    }
    if (!window.confirm('重置后旧 API Key 会立即失效，确认继续吗？')) {
      return
    }
    setBusyAction('self-api-key')
    try {
      const payload = await regenerateUserApiKey(currentUser.id)
      setSelfUserApiKey(payload)
      setSelfApiKeyCopied(false)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 清空站点编辑表单。
   */
  const resetSiteForm = () => {
    setEditingSiteId(null)
    setSiteCode('')
    setSiteName('')
  }

  /**
   * AI by zb: 将站点记录带入工作台站点配置表单。
   */
  const handleEditSite = (site: SiteItem) => {
    setEditingSiteId(site.id)
    setSiteCode(site.code)
    setSiteName(site.name)
    setSiteModalOpen(true)
  }

  /**
   * AI by zb: 打开站点配置弹窗并保持查询列表从第一页开始。
   */
  const openSiteModal = () => {
    setSiteModalOpen(true)
    setSitePage(1)
  }

  /**
   * AI by zb: 切换当前工作台站点上下文并缓存到本地。
   */
  const handleSiteChange = (siteCode: string) => {
    setSelectedSiteCode(siteCode)
    window.localStorage.setItem(SELECTED_SITE_STORAGE_KEY, siteCode)
    setAccountPage(1)
    setSelectedId(null)
    setDetail(null)
    setMessages([])
    setSelectedMessage(null)
    setReleaseTarget(null)
    setReleaseSiteCode('')
    setConsumeTarget(null)
    setConsumeSiteCode('')
  }

  /**
   * AI by zb: 在工作台中新增或更新站点配置。
   */
  const handleSubmitSite = async () => {
    if (!siteCode.trim() || !siteName.trim()) {
      flash('error', '请输入站点编码和站点名称')
      return
    }
    setBusyAction('site')
    try {
      if (editingSiteId) {
        await updateSite(editingSiteId, { code: siteCode, name: siteName })
      } else {
        await createSite({ code: siteCode, name: siteName, enabled: true })
      }
      resetSiteForm()
      await loadSites()
      setSitePage(1)
      flash('success', editingSiteId ? '站点已更新' : '站点已新增')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 在工作台中切换站点启停状态。
   */
  const handleToggleSiteEnabled = async (site: SiteItem) => {
    setBusyAction(`site-${site.id}`)
    try {
      await updateSite(site.id, { enabled: !site.enabled })
      await loadSites()
      flash('success', site.enabled ? '站点已停用' : '站点已启用')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 加载当前邮箱详情。
   */
  const loadDetail = async (accountId: number) => {
    const current = await apiFetch<AccountDetail>(`/api/accounts/${accountId}`)
    setDetail(current)
  }

  /**
   * AI by zb: 加载当前文件夹下的邮件列表。
   */
  const loadMessages = async (
    accountId: number,
    targetFolder: 'inbox' | 'sent',
    preserveMessageId?: number | null,
  ) => {
    const list = await apiFetch<MessageItem[]>(`/api/accounts/${accountId}/messages?folder=${targetFolder}`)
    setMessages(list)
    if (preserveMessageId && list.some((item) => item.id === preserveMessageId)) {
      const current = await apiFetch<MessageDetail>(`/api/accounts/${accountId}/messages/${preserveMessageId}`)
      setSelectedMessage(current)
      return
    }
    setSelectedMessage(null)
    setMessageOpen(false)
  }

  /**
   * AI by zb: 打开单封邮件详情。
   */
  const openMessage = async (messageId: number) => {
    if (!selectedId) {
      return
    }
    const current = await apiFetch<MessageDetail>(`/api/accounts/${selectedId}/messages/${messageId}`)
    setSelectedMessage(current)
    setMessageOpen(true)
  }

  /**
   * AI by zb: 仅刷新当前选中邮箱的本地展示内容，不触发远端同步。
   */
  const refreshCurrentMailboxView = async (accountId: number) => {
    const preserveMessageId = messageOpen ? selectedMessage?.id : null
    await loadDetail(accountId)
    await loadMessages(accountId, folder, preserveMessageId)
  }

  /**
   * AI by zb: 手动同步当前邮箱缓存，并重置自动刷新倒计时。
   */
  const syncCurrentMailbox = async (accountId: number) => {
    setBusyAction('sync')
    try {
      await apiFetch(`/api/accounts/${accountId}/sync`, { method: 'POST' })
      await refreshCurrentMailboxView(accountId)
      await loadAccounts(accountId)
      setCountdown(AUTO_REFRESH_SECONDS)
      flash('success', '邮箱已刷新')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 自动刷新当前选中邮箱内容，调用同步接口但不弹提示。
   */
  const autoRefreshCurrentMailbox = async (accountId: number) => {
    if (autoSyncing || busyAction === 'sync') {
      return
    }
    setAutoSyncing(true)
    try {
      await apiFetch(`/api/accounts/${accountId}/sync`, { method: 'POST' })
      await refreshCurrentMailboxView(accountId)
    } catch {
      await loadDetail(accountId).catch(() => {})
    } finally {
      setAutoSyncing(false)
      setCountdown(AUTO_REFRESH_SECONDS)
    }
  }

  /**
   * AI by zb: 提交 Outlook 批量导入内容。
   */
  const submitImport = async () => {
    if (!importValue.trim()) {
      flash('error', '请先粘贴 Outlook 账号内容')
      return
    }
    setBusyAction('import')
    try {
      const result = await importAccounts({
        data: importValue,
        enabled: true,
        batch_code: importBatch,
        owner_user_id: isAdmin ? activeUserId : currentUser?.id,
      })
      const hasFailures = result.failed > 0 || result.errors.length > 0
      setImportResult(hasFailures ? result : null)
      await loadAccounts(selectedId)
      await loadPoolSummary()
      if (hasFailures) {
        flash('error', `导入完成，但有 ${result.failed} 条失败，请检查弹窗结果`)
        return
      }
      setImportValue('')
      setImportBatch('')
      setImportOpen(false)
      flash('success', `导入完成：新增 ${result.created}，更新 ${result.updated}`)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 打开导入弹窗时清空上一次的导入结果提示。
   */
  const openImportDialog = () => {
    setImportResult(null)
    setShareResult(null)
    setImportOpen(true)
  }

  /**
   * AI by zb: 更新左侧邮箱搜索关键字并重置到第一页。
   */
  const changeAccountQuery = (value: string) => {
    setQuery(value)
    setAccountPage(1)
  }

  /**
   * AI by zb: 提交当前邮箱的发件请求。
   */
  const submitSend = async () => {
    if (!selectedId) return
    if (!sendForm.to.trim() || !sendForm.subject.trim()) {
      flash('error', '收件人和主题不能为空')
      return
    }
    setBusyAction('send')
    try {
      await apiFetch(`/api/accounts/${selectedId}/send`, {
        method: 'POST',
        body: JSON.stringify(sendForm),
      })
      setSendOpen(false)
      setSendForm({ to: '', cc: '', bcc: '', subject: '', body_text: '', body_html: '' })
      flash('success', '邮件已发送')
      await syncCurrentMailbox(selectedId)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 创建无需登录访问的临时分享链接。
   */
  const createShareLink = async () => {
    if (!selectedId) return
    setBusyAction('share')
    try {
      const result = await apiFetch<ShareResult>(`/api/accounts/${selectedId}/shares`, {
        method: 'POST',
        body: JSON.stringify({ days: shareDays }),
      })
      setShareResult(result)
      flash('success', '临时授权链接已生成，旧链接已被覆盖')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 从当前站点的账号池中随机使用一个邮箱，并切换到已消费详情。
   */
  const pickRandomMailbox = async () => {
    if (!selectedSiteCode) {
      flash('error', '请先选择站点')
      return
    }
    setBusyAction('random-consume')
    try {
      const result = await consumeRandomPoolAccount({
        site_code: selectedSiteCode,
        owner_user_id: isAdmin ? activeUserId : currentUser?.id,
        page_size: ACCOUNT_PAGE_SIZE,
      })
      setQuery('')
      setScope('consumed')
      setAccountPage(result.page)
      await loadAccounts(result.item.id, result.page, { scopeOverride: 'consumed', queryOverride: '' })
      await loadPoolSummary()
      await loadDetail(result.item.id).catch(() => {})
      flash('success', `已随机使用邮箱 ${result.item.email}`)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 切换指定邮箱的置顶状态。
   */
  const togglePinAccount = async (account: AccountItem) => {
    setPinningId(account.id)
    try {
      await updateAccount(account.id, { is_pinned: !account.is_pinned })
      await loadAccounts(account.id)
      await loadPoolSummary()
      if (selectedId === account.id) {
        await loadDetail(account.id)
      }
      flash('success', account.is_pinned ? '已取消置顶邮箱' : '邮箱已置顶')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setPinningId(null)
    }
  }

  /**
   * AI by zb: 打开退回站点使用弹窗，并默认选中第一条活跃站点记录。
   */
  const requestReleaseAccount = (account: AccountItem) => {
    setReleaseTarget(account)
    setReleaseSiteCode(selectedSiteCode)
  }

  /**
   * AI by zb: 释放当前邮箱在选中站点上的使用记录并刷新列表。
   */
  const handleReleaseAccount = async () => {
    if (!releaseTarget || !releaseSiteCode) return
    setReleasingId(releaseTarget.id)
    try {
      const result = await releaseAccount(releaseTarget.id, { site_code: releaseSiteCode })
      setReleaseTarget(null)
      setReleaseSiteCode('')
      await loadAccounts(undefined, accountPage)
      await loadPoolSummary()
      flash('success', result.message || '邮箱已退回')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setReleasingId(null)
    }
  }

  /**
   * AI by zb: 打开删除邮箱的二次确认弹窗。
   */
  const requestDeleteAccount = (account: AccountItem) => {
    setDeleteTarget(account)
  }

  /**
   * AI by zb: 打开手动使用邮箱弹窗，并预置可选站点。
   */
  const requestConsumeAccount = (account: AccountItem) => {
    setConsumeTarget(account)
    setConsumeSiteCode(selectedSiteCode)
  }

  /**
   * AI by zb: 提交手动使用邮箱请求并刷新工作台。
   */
  const submitConsumeAccount = async () => {
    if (!consumeTarget || !consumeSiteCode) return
    setBusyAction('consume')
    try {
      const result = await consumeAccount(consumeTarget.id, { site_code: consumeSiteCode })
      setConsumeTarget(null)
      setConsumeSiteCode('')
      await loadAccounts(undefined, accountPage)
      await loadPoolSummary()
      flash('success', result.message || '邮箱已标记为使用中')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 软删除指定邮箱，并同步刷新列表与统计。
   */
  const confirmDeleteAccount = async () => {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      const result = await deleteAccount(deleteTarget.id)
      setDeleteTarget(null)
      await loadAccounts(undefined, accountPage)
      await loadPoolSummary()
      flash('success', result.message || '邮箱已软删除')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setDeletingId(null)
    }
  }

  /**
   * AI by zb: 切换当前查看的目标用户。
   */
  const handleUserChange = (userId: number) => {
    setActiveUserId(userId || null)
    setAccountPage(1)
    setSelectedId(null)
    setDetail(null)
    setMessages([])
    setSelectedMessage(null)
  }

  /**
   * AI by zb: 切换邮箱作用域并重置上下文。
   */
  const handleScopeChange = (nextScope: 'consumed' | 'pool') => {
    setScope(nextScope)
    setAccountPage(1)
    setSelectedId(null)
    setDetail(null)
    setMessages([])
    setSelectedMessage(null)
  }

  /**
   * AI by zb: 切换当前邮箱并拉取详情与邮件数据。
   */
  const activateAccount = async (accountId: number) => {
    setBusyAction('switch')
    try {
      setSelectedId(accountId)
      setDetail(null)
      setMessages([])
      setSelectedMessage(null)
      setMessageOpen(false)
      await refreshCurrentMailboxView(accountId)
      setCountdown(AUTO_REFRESH_SECONDS)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction('')
    }
  }

  /**
   * AI by zb: 切换当前查看的文件夹。
   */
  const changeFolder = async (targetFolder: 'inbox' | 'sent') => {
    if (!selectedId) {
      setFolder(targetFolder)
      return
    }
    setFolder(targetFolder)
    try {
      await loadMessages(selectedId, targetFolder)
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    bootstrapUsers().catch((error) => {
      flash('error', error instanceof Error ? error.message : String(error))
    })
    loadSites().catch((error) => {
      flash('error', error instanceof Error ? error.message : String(error))
    })
  }, [])

  useEffect(() => {
    if (!sitesLoaded || !enabledSites.length) {
      return
    }
    const cachedSiteCode = window.localStorage.getItem(SELECTED_SITE_STORAGE_KEY) || ''
    const nextSiteCode = enabledSites.some((site) => site.code === selectedSiteCode)
      ? selectedSiteCode
      : enabledSites.some((site) => site.code === cachedSiteCode)
        ? cachedSiteCode
        : enabledSites[0].code
    if (nextSiteCode !== selectedSiteCode) {
      setSelectedSiteCode(nextSiteCode)
      window.localStorage.setItem(SELECTED_SITE_STORAGE_KEY, nextSiteCode)
    }
  }, [enabledSites, selectedSiteCode, sitesLoaded])

  useEffect(() => {
    if (!currentUser || !sitesLoaded || !selectedSiteCode) {
      return
    }
    loadAccounts(requestedAccountId).catch((error) => {
      flash('error', error instanceof Error ? error.message : String(error))
    })
    loadPoolSummary().catch(() => {})
  }, [currentUser, activeUserId, scope, query, accountPage, requestedAccountId, selectedSiteCode, sitesLoaded])

  useEffect(() => {
    if (!selfManageOpen || !currentUser) {
      return
    }
    loadManageAccounts().catch((error) => {
      flash('error', error instanceof Error ? error.message : String(error))
    })
    loadSelfUserApiKey().catch((error) => {
      flash('error', error instanceof Error ? error.message : String(error))
    })
  }, [selfManageOpen, currentUser, manageAccountPage, manageAccountScope, manageAccountKeyword, manageAccountBatch])

  useEffect(() => {
    if (!selectedId) return
    activateAccount(selectedId).catch((error) => {
      flash('error', error instanceof Error ? error.message : String(error))
    })
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          autoRefreshCurrentMailbox(selectedId).catch(() => {})
          return AUTO_REFRESH_SECONDS
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [selectedId, folder, selectedMessage?.id, messageOpen, busyAction, autoSyncing])

  useEffect(() => {
    if (sitePage > siteTotalPages) {
      setSitePage(siteTotalPages)
    }
  }, [sitePage, siteTotalPages])

  return (
    <div className="station-layout station-layout--workspace">
      <ToastStack toasts={toasts} />

      <section className="workspace-page-hero">
        <header className="workspace-page-header">
          <div className="workspace-page-header__content">
            <span className="section-kicker workspace-page-header__brand">OUTLOOK MAIL STATION</span>
            <h1>邮件工作台</h1>
            <div className="workspace-page-header__meta">
              <span className="status-pill is-good" title={currentWorkspaceLabel}>
                当前用户 {currentWorkspaceLabel}
              </span>
              <span className="status-pill is-muted">当前站点 {selectedSite?.name || '未选择站点'}</span>
              <span className="status-pill is-muted">{scope === 'pool' ? '查看账号池邮箱' : '查看已消费邮箱'}</span>
              <span className="status-pill is-muted">当前列表 {accountTotal} 项</span>
            </div>
          </div>
          <div className="workspace-page-header__actions">
            <div className="workspace-page-header__secondary-actions">
              {isAdmin ? (
                <button className="ghost-button workspace-page-header__secondary-button" type="button" onClick={openSiteModal}>
                  站点配置
                </button>
              ) : null}
              {isAdmin ? (
                <button className="ghost-button workspace-page-header__secondary-button" type="button" onClick={() => navigate('/users')}>
                  用户管理
                </button>
              ) : (
                <button className="ghost-button workspace-page-header__secondary-button" type="button" onClick={() => void openCurrentUserApiKeyModal()}>
                  API Key
                </button>
              )}
              <button
                className="ghost-button workspace-page-header__secondary-button workspace-page-header__logout-button"
                type="button"
                onClick={() => { clearAdminToken(); window.location.replace('/login') }}
              >
                退出登录
              </button>
            </div>
          </div>
        </header>

        <section className="metrics-panel metrics-panel--hero" aria-label="工作台概览">
          <article className="metric-card">
            <span className="metric-card__label">池内邮箱总量</span>
            <strong className="metric-card__value">{poolSummary?.pool_count ?? 0}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">当前站点已消费</span>
            <strong className="metric-card__value">{poolSummary?.consumed_count ?? 0}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">当前列表数量</span>
            <strong className="metric-card__value">{accountTotal}</strong>
          </article>
        </section>
      </section>

      <main className="dashboard-grid dashboard-grid--workspace">
        <AccountSidebar
          accounts={accounts}
          query={query}
          total={accountTotal}
          page={accountPage}
          totalPages={accountTotalPages}
          selectedId={selectedId}
          scope={scope}
          selectedSiteCode={selectedSiteCode}
          inboxTotal={detail?.inbox_count || 0}
          currentUser={currentUser}
          users={sidebarUsers}
          sites={enabledSites}
          activeUserId={activeUserId}
          onQueryChange={changeAccountQuery}
          onSelect={setSelectedId}
          onOpenImport={openImportDialog}
          onTogglePin={togglePinAccount}
          onRequestRelease={requestReleaseAccount}
          onRequestDelete={requestDeleteAccount}
          onRequestConsume={requestConsumeAccount}
          onSiteChange={handleSiteChange}
          onUserChange={handleUserChange}
          onScopeChange={handleScopeChange}
          onPageChange={setAccountPage}
          pinningId={pinningId}
          releasingId={releasingId}
        />

        <section className="content-stack">
          <section className="current-mailbox-card">
            <div className="current-mailbox-card__header">
              <div className="current-mailbox-card__main current-mailbox-card__main--stacked">
                <div className="badge-title">当前邮箱</div>
                <p className="current-mailbox-card__summary">邮箱详情、同步状态与常用操作集中展示。</p>
              </div>
              <div className="mailbox-flags">
                {detail?.active_sites.map((site) => (
                  <span key={site.id} className="status-pill is-muted" title={`${site.site_name} · ${site.source}`}>
                    {site.site_name}
                  </span>
                ))}
                {detail?.has_oauth ? <span className="status-pill is-good">OAuth</span> : null}
                {detail?.has_password ? <span className="status-pill is-good">密码</span> : null}
                {detail && !detail.enabled ? <span className="status-pill is-muted">已停用</span> : null}
              </div>
            </div>

            <div className="current-mailbox-card__body">
              <div className="mailbox-hero" title={detail?.email || '导入邮箱后会显示在这里'}>
                {detail?.email || '导入邮箱后会显示在这里'}
              </div>

              <div className="action-grid">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!detail}
                  onClick={() => detail && copyText(detail.email).then(() => flash('success', '邮箱已复制')).catch(() => {})}
                >
                  复制邮箱
                </button>
                <button className="gradient-button" type="button" disabled={!detail} onClick={() => setSendOpen(true)}>
                  发邮件
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!detail || busyAction === 'sync' || autoSyncing}
                  onClick={() => selectedId && syncCurrentMailbox(selectedId)}
                >
                  {busyAction === 'sync' ? '刷新中...' : '手动刷新'}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!detail}
                  onClick={() => {
                    setShareOpen(true)
                    setShareResult(null)
                  }}
                >
                  临时授权
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!selectedSiteCode || busyAction === 'random-consume'}
                  onClick={() => void pickRandomMailbox()}
                >
                  {busyAction === 'random-consume' ? '使用中...' : '随机使用'}
                </button>
              </div>

              <div className="mailbox-summary">
                <div>
                  <span>最近同步</span>
                  <strong>{formatTime(detail?.last_synced_at || null)}</strong>
                </div>
                <div>
                  <span>收件 / 发件</span>
                  <strong>{detail?.inbox_count || 0} / {detail?.sent_count || 0}</strong>
                </div>
                <div>
                  <span>最近错误</span>
                  <strong>{detail?.last_error || '无'}</strong>
                </div>
              </div>
            </div>
          </section>

          <MessageList
            messages={messages}
            countdown={countdown}
            folder={folder}
            onFolderChange={changeFolder}
            onSelectMessage={openMessage}
          />
        </section>
      </main>

      <MessageDetailModal
        open={messageOpen}
        message={selectedMessage}
        onClose={() => setMessageOpen(false)}
        onFlash={flash}
      />
      <UserAccountManagementModal
        open={selfManageOpen && Boolean(currentUser)}
        username={currentUser?.username || ''}
        onClose={() => setSelfManageOpen(false)}
        onOpenImport={() => setImportOpen(true)}
        onExport={() => void handleManageExportAccounts()}
        exportBusy={busyAction === 'manage-export'}
        scope={manageAccountScope}
        keywordInput={manageAccountKeywordInput}
        batchInput={manageAccountBatchInput}
        availableBatchCodes={manageAvailableBatchCodes}
        onScopeChange={handleManageChangeScope}
        onKeywordInputChange={setManageAccountKeywordInput}
        onBatchInputChange={setManageAccountBatchInput}
        onSearchSubmit={handleManageSearchSubmit}
        onResetFilters={handleManageResetFilters}
        hasSelectedAccounts={manageHasSelectedAccounts}
        selectionLabel={manageBatchActionLabel}
        selectionHint={manageAccountKeyword ? `关键词：${manageAccountKeyword}` : '支持批量启停'}
        onBatchEnable={() => void handleManageBatchUpdateEnabled(true)}
        onBatchDisable={() => void handleManageBatchUpdateEnabled(false)}
        batchEnableBusy={busyAction === 'manage-batch-enable'}
        batchDisableBusy={busyAction === 'manage-batch-disable'}
        accounts={manageAccounts}
        selectedAccountIds={manageSelectedAccountIds}
        allVisibleSelected={manageAllVisibleSelected}
        onToggleAllAccounts={handleToggleAllManageAccounts}
        onToggleAccountSelection={handleToggleManageAccountSelection}
        onOpenAccountQuery={(account) => setManageActiveAccount(account)}
        accountPage={manageAccountPage}
        accountTotalPages={manageAccountTotalPages}
        accountTotal={manageAccountTotal}
        onPrevPage={() => setManageAccountPage((current) => Math.max(current - 1, 1))}
        onNextPage={() => setManageAccountPage((current) => Math.min(current + 1, manageAccountTotalPages))}
      />

      <UserApiKeyModal
        open={selfApiKeyOpen && Boolean(currentUser)}
        username={currentUser?.username || ''}
        apiKey={selfUserApiKey?.api_key || ''}
        updatedAt={selfUserApiKey?.updated_at}
        loading={selfApiKeyLoading}
        copied={selfApiKeyCopied}
        busy={busyAction === 'self-api-key'}
        onClose={() => setSelfApiKeyOpen(false)}
        onCopy={() => void handleCopySelfApiKey()}
        onRegenerate={() => void handleRegenerateSelfApiKey()}
      />

      {manageActiveAccount ? (
        <div className="shell-modal__backdrop" onClick={() => setManageActiveAccount(null)}>
          <div className="shell-modal shell-modal--compact user-account-query-modal" onClick={(event) => event.stopPropagation()}>
            <div className="shell-modal__header user-import-modal__header">
              <div>
                <span className="section-kicker">账号查询</span>
                <h3>{manageActiveAccount.email}</h3>
                <p>查看当前邮箱的归属、批次、站点使用与收发统计。</p>
              </div>
              <button className="icon-close-button shell-modal__close" type="button" onClick={() => setManageActiveAccount(null)} aria-label="关闭账号查询弹窗">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="user-account-query-modal__body">
              <div className="user-account-query-modal__grid">
                <div>
                  <span>邮箱</span>
                  <strong>{manageActiveAccount.email}</strong>
                </div>
                <div>
                  <span>归属用户</span>
                  <strong>{manageActiveAccount.owner_username || currentUser?.username || '-'}</strong>
                </div>
                <div>
                  <span>当前状态</span>
                  <strong>{manageActiveAccount.enabled ? '启用' : '禁用'}</strong>
                </div>
                <div>
                  <span>账户类型</span>
                  <strong>{manageActiveAccount.is_consumed ? '已消费' : '池内'}</strong>
                </div>
                <div>
                  <span>批次</span>
                  <strong>{manageActiveAccount.batch_code || '默认批次'}</strong>
                </div>
                <div>
                  <span>收件数</span>
                  <strong>{manageActiveAccount.inbox_count}</strong>
                </div>
                <div>
                  <span>发件数</span>
                  <strong>{manageActiveAccount.sent_count}</strong>
                </div>
                <div>
                  <span>站点使用</span>
                  <strong>{manageActiveAccount.active_sites.length ? manageActiveAccount.active_sites.map((site) => site.site_name).join(' / ') : '无'}</strong>
                </div>
              </div>
            </div>
            <div className="shell-modal__footer">
              <button className="gradient-button" type="button" onClick={() => setManageActiveAccount(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ShellModal
        open={siteModalOpen}
        title="站点配置"
        onClose={() => {
          setSiteModalOpen(false)
          resetSiteForm()
        }}
        className="shell-modal--import"
        bodyClassName="shell-modal__body--site-admin"
        footer={
          <button className="ghost-button" type="button" onClick={() => {
            setSiteModalOpen(false)
            resetSiteForm()
          }}>
            关闭
          </button>
        }
      >
        <div className="site-admin-panel__intro">
          固定维护邮箱实际使用的站点，新增、搜索与分页查询都在当前弹窗内完成。
        </div>
        <div className="site-admin-panel__body">
          <div className="site-admin-panel__form">
            <label className="site-admin-panel__field" htmlFor="workspace-site-code">
              <span>站点编码</span>
              <input id="workspace-site-code" value={siteCode} onChange={(event) => setSiteCode(event.target.value.toUpperCase())} placeholder="例如 GPT" />
            </label>
            <label className="site-admin-panel__field" htmlFor="workspace-site-name">
              <span>站点名称</span>
              <input id="workspace-site-name" value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="例如 ChatGPT" />
            </label>
            <div className="site-admin-panel__actions">
              <button className="ghost-button" type="button" onClick={resetSiteForm} disabled={busyAction === 'site'}>
                清空
              </button>
              <button className="gradient-button" type="button" onClick={() => void handleSubmitSite()} disabled={busyAction === 'site'}>
                {busyAction === 'site' ? '保存中...' : editingSiteId ? '保存站点' : '新增站点'}
              </button>
            </div>
          </div>
          <div className="site-admin-panel__list">
            <div className="site-admin-panel__toolbar">
              <input
                value={siteQuery}
                onChange={(event) => {
                  setSiteQuery(event.target.value)
                  setSitePage(1)
                }}
                placeholder="搜索站点编码或名称"
              />
              <span>{filteredSites.length} 项</span>
            </div>
            {visibleSites.length ? visibleSites.map((site) => {
              const isProcessing = busyAction === `site-${site.id}`
              return (
                <div key={site.id} className="site-admin-panel__row">
                  <div className="site-admin-panel__info">
                    <strong>{site.name}</strong>
                    <span>{site.code}</span>
                  </div>
                  <div className="site-admin-panel__status">
                    <span className={`status-pill ${site.enabled ? 'is-good' : 'is-muted'}`}>{site.enabled ? '启用' : '停用'}</span>
                  </div>
                  <div className="site-admin-panel__row-actions">
                    <button className="ghost-button site-admin-panel__mini-button" type="button" onClick={() => handleEditSite(site)}>
                      编辑
                    </button>
                    <button className="ghost-button site-admin-panel__mini-button" type="button" onClick={() => void handleToggleSiteEnabled(site)} disabled={isProcessing}>
                      {isProcessing ? '处理中...' : site.enabled ? '停用' : '启用'}
                    </button>
                  </div>
                </div>
              )
            }) : <div className="site-admin-panel__empty">当前筛选条件下暂无站点。</div>}
            <div className="site-admin-panel__pagination">
              <button className="ghost-button site-admin-panel__mini-button" type="button" onClick={() => setSitePage((current) => Math.max(current - 1, 1))} disabled={sitePage <= 1}>
                上一页
              </button>
              <span>第 {sitePage} / {siteTotalPages} 页</span>
              <button className="ghost-button site-admin-panel__mini-button" type="button" onClick={() => setSitePage((current) => Math.min(current + 1, siteTotalPages))} disabled={sitePage >= siteTotalPages}>
                下一页
              </button>
            </div>
          </div>
        </div>
      </ShellModal>

      <ImportAccountsModal
        open={importOpen}
        title="批量导入 Outlook"
        description="按实际导入格式粘贴后即可一次性写入当前工作区邮箱池。"
        targetName={currentWorkspaceLabel}
        targetStatus={isAdmin ? (activeUserId ? '已选定目标用户' : '请先选择目标用户') : '当前登录用户'}
        value={importValue}
        onValueChange={setImportValue}
        batchValue={importBatch}
        onBatchValueChange={setImportBatch}
        placeholder="示例：example@outlook.com----password----client_id----refresh_token"
        onClose={() => setImportOpen(false)}
        onSubmit={submitImport}
        submitting={busyAction === 'import'}
        submitLabel="开始导入"
        loadingLabel="导入中..."
        result={importResult}
      />

      <ShellModal
        open={sendOpen}
        title="发送邮件"
        onClose={() => setSendOpen(false)}
        className="shell-modal--send"
        bodyClassName="shell-modal__body--form-stack"
        footer={
          <>
            <button className="ghost-button" type="button" onClick={() => setSendOpen(false)}>
              取消
            </button>
            <button className="gradient-button" type="button" onClick={submitSend} disabled={busyAction === 'send'}>
              {busyAction === 'send' ? '发送中...' : '立即发送'}
            </button>
          </>
        }
      >
        <div className="mailbox-meta-grid">
          <input placeholder="收件人，多个用英文逗号分隔" value={sendForm.to} onChange={(event) => setSendForm((current) => ({ ...current, to: event.target.value }))} />
          <input placeholder="抄送" value={sendForm.cc} onChange={(event) => setSendForm((current) => ({ ...current, cc: event.target.value }))} />
          <input placeholder="密送" value={sendForm.bcc} onChange={(event) => setSendForm((current) => ({ ...current, bcc: event.target.value }))} />
        </div>
        <input placeholder="主题" value={sendForm.subject} onChange={(event) => setSendForm((current) => ({ ...current, subject: event.target.value }))} />
        <textarea placeholder="纯文本正文" value={sendForm.body_text} onChange={(event) => setSendForm((current) => ({ ...current, body_text: event.target.value }))} />
        <textarea placeholder="HTML 正文（可选）" value={sendForm.body_html} onChange={(event) => setSendForm((current) => ({ ...current, body_html: event.target.value }))} />
      </ShellModal>

      <ShellModal
        open={shareOpen}
        title="创建临时授权"
        onClose={() => setShareOpen(false)}
        className="shell-modal--share"
        bodyClassName="shell-modal__body--form-stack"
        footer={
          <>
            <button className="ghost-button" type="button" onClick={() => setShareOpen(false)}>
              取消
            </button>
            <button className="gradient-button" type="button" onClick={createShareLink} disabled={busyAction === 'share'}>
              {busyAction === 'share' ? '生成中...' : '生成链接'}
            </button>
          </>
        }
      >
        <div className="mailbox-meta-grid">
          <div>
            <span>有效天数</span>
            <input type="number" min={1} max={365} value={shareDays} onChange={(event) => setShareDays(Number(event.target.value || 1))} />
          </div>
        </div>
        {shareResult ? (
          <div className="share-result">
            <div className="share-result__header">
              <strong>授权已生成</strong>
              <span>{formatTime(shareResult.expires_at)}</span>
            </div>
            <input readOnly value={shareResult.url} />
            <button className="ghost-button" type="button" onClick={() => copyText(shareResult.url).then(() => flash('success', '授权链接已复制')).catch(() => {})}>
              复制链接
            </button>
          </div>
        ) : null}
      </ShellModal>

      <ShellModal
        open={Boolean(consumeTarget)}
        title="手动使用邮箱"
        onClose={() => {
          setConsumeTarget(null)
          setConsumeSiteCode('')
        }}
        className="shell-modal--share"
        bodyClassName="shell-modal__body--form-stack"
        footer={
          <>
            <button className="ghost-button" type="button" onClick={() => {
              setConsumeTarget(null)
              setConsumeSiteCode('')
            }}>
              取消
            </button>
            <button className="gradient-button" type="button" onClick={submitConsumeAccount} disabled={busyAction === 'consume' || !consumeSiteCode}>
              {busyAction === 'consume' ? '提交中...' : '确认使用'}
            </button>
          </>
        }
      >
        <div className="import-modal__intro">
          <strong>{consumeTarget?.email || '待选择邮箱'}</strong>
          <p>手动使用会按当前站点 {selectedSite?.name || '未选择站点'} 写入使用记录；同一邮箱可被不同站点重复使用。</p>
        </div>
        <div className="mailbox-meta-grid">
          <div>
            <span>站点</span>
            <input readOnly value={selectedSite?.name || ''} />
          </div>
        </div>
      </ShellModal>

      <ShellModal
        open={Boolean(releaseTarget)}
        title="退回站点使用"
        onClose={() => {
          setReleaseTarget(null)
          setReleaseSiteCode('')
        }}
        className="shell-modal--share"
        bodyClassName="shell-modal__body--form-stack"
        footer={
          <>
            <button className="ghost-button" type="button" onClick={() => {
              setReleaseTarget(null)
              setReleaseSiteCode('')
            }}>
              取消
            </button>
            <button className="gradient-button" type="button" onClick={handleReleaseAccount} disabled={releasingId !== null || !releaseSiteCode}>
              {releasingId !== null ? '退回中...' : '确认退回'}
            </button>
          </>
        }
      >
        <div className="import-modal__intro">
          <strong>{releaseTarget?.email || '待选择邮箱'}</strong>
          <p>将退回当前站点 {selectedSite?.name || '未选择站点'} 的使用记录；退回后该邮箱会恢复为该站点可再次使用。</p>
        </div>
        <div className="mailbox-meta-grid">
          <div>
            <span>站点</span>
            <input readOnly value={selectedSite?.name || ''} />
          </div>
        </div>
      </ShellModal>

      <ShellModal
        open={Boolean(deleteTarget)}
        title="确认软删除邮箱"
        onClose={() => setDeleteTarget(null)}
        className="shell-modal--danger"
        footer={
          <>
            <button className="ghost-button" type="button" onClick={() => setDeleteTarget(null)}>
              取消
            </button>
            <button className="gradient-button" type="button" onClick={confirmDeleteAccount} disabled={deletingId !== null}>
              {deletingId !== null ? '处理中...' : '确认软删除'}
            </button>
          </>
        }
      >
        <div className="danger-confirm__target">
          <strong>{deleteTarget?.email}</strong>
          <p>软删除后该邮箱会对整站不可见，并自动释放全部站点使用记录，但历史元数据仍会保留。</p>
        </div>
      </ShellModal>
    </div>
  )
}
