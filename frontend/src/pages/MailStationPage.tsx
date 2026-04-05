import { useEffect, useState } from 'react'

import { AccountSidebar } from '@/components/AccountSidebar'
import { MessageDetailModal } from '@/components/MessageDetailModal'
import { MessageList } from '@/components/MessageList'
import { ShellModal } from '@/components/ShellModal'
import { ToastMessage, ToastStack } from '@/components/ToastStack'
import { apiFetch, copyText, formatTime, logoutAdmin } from '@/lib/api'
import { AccountDetail, AccountItem, AccountListResponse, ImportResult, MessageDetail, MessageItem, ShareResult } from '@/types'


const AUTO_REFRESH_SECONDS = 10
const ACCOUNT_PAGE_SIZE = 10


/**
 * AI by zb: Outlook 邮件站主页面。
 */
export function MailStationPage() {
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

  const [importOpen, setImportOpen] = useState(false)
  const [importValue, setImportValue] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const [sendOpen, setSendOpen] = useState(false)
  const [sendForm, setSendForm] = useState({ to: '', cc: '', bcc: '', subject: '', body_text: '', body_html: '' })

  const [shareOpen, setShareOpen] = useState(false)
  const [shareDays, setShareDays] = useState(30)
  const [shareResult, setShareResult] = useState<ShareResult | null>(null)
  const [pinningId, setPinningId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AccountItem | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

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
   * AI by zb: 加载邮箱列表，并在首次进入时自动选中第一项。
   */
  const loadAccounts = async (preferredId?: number | null, requestedPage = accountPage) => {
    const response = await apiFetch<AccountListResponse>(
      `/api/accounts?query=${encodeURIComponent(query)}&page=${requestedPage}&page_size=${ACCOUNT_PAGE_SIZE}`,
    )
    const list = response.items
    setAccounts(list)
    setAccountTotal(response.total)
    setAccountTotalPages(response.total_pages)
    if (response.page !== accountPage) {
      setAccountPage(response.page)
    }
    const nextId = preferredId ?? selectedId
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
      const current = await apiFetch<MessageDetail>(`/api/messages/${preserveMessageId}`)
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
    const current = await apiFetch<MessageDetail>(`/api/messages/${messageId}`)
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
      const result = await apiFetch<ImportResult>('/api/accounts/import', {
        method: 'POST',
        body: JSON.stringify({ data: importValue, enabled: true }),
      })
      const hasFailures = result.failed > 0 || result.errors.length > 0
      setImportResult(hasFailures ? result : null)
      await loadAccounts(selectedId)
      if (hasFailures) {
        flash('error', `导入完成，但有 ${result.failed} 条失败，请检查弹窗结果`)
        return
      }
      setImportValue('')
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
   * AI by zb: 切换指定邮箱的置顶状态。
   */
  const togglePinAccount = async (account: AccountItem) => {
    setPinningId(account.id)
    try {
      await apiFetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_pinned: !account.is_pinned }),
      })
      await loadAccounts(account.id)
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
   * AI by zb: 打开删除邮箱的二次确认弹窗。
   */
  const requestDeleteAccount = (account: AccountItem) => {
    setDeleteTarget(account)
  }

  /**
   * AI by zb: 删除指定邮箱及其本地邮件缓存。
   */
  const confirmDeleteAccount = async () => {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      await apiFetch(`/api/accounts/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      await loadAccounts(undefined, accountPage)
      flash('success', '邮箱已删除')
    } catch (error) {
      flash('error', error instanceof Error ? error.message : String(error))
    } finally {
      setDeletingId(null)
    }
  }

  /**
   * AI by zb: 切换当前邮箱并拉取详情与邮件数据。
   */
  const activateAccount = async (accountId: number) => {
    setBusyAction('switch')
    try {
      setSelectedId(accountId)
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
    loadAccounts().catch((error) => {
      flash('error', error instanceof Error ? error.message : String(error))
    })
  }, [query, accountPage])

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

  return (
    <div className="app-shell">
      <ToastStack toasts={toasts} />

      <header className="topbar">
        <div>
          <div className="brand-mark">Outlook Mail Station</div>
          <h1>独立 Outlook 邮件维护站</h1>
          <p>导入账号、同步收件、发信与临时授权都在这里完成。</p>
        </div>
        <div className="topbar__actions">
          <button className="ghost-button" type="button" onClick={logoutAdmin}>
            退出登录
          </button>
          <button className="ghost-button" type="button" onClick={() => loadAccounts(selectedId).catch(() => {})}>
            刷新邮箱列表
          </button>
          <button className="gradient-button" type="button" onClick={openImportDialog}>
            导入 Outlook
          </button>
        </div>
      </header>

      <main className="dashboard-grid">
        <AccountSidebar
          accounts={accounts}
          query={query}
          total={accountTotal}
          page={accountPage}
          totalPages={accountTotalPages}
          selectedId={selectedId}
          onQueryChange={changeAccountQuery}
          onSelect={setSelectedId}
          onOpenImport={openImportDialog}
          onTogglePin={togglePinAccount}
          onRequestDelete={requestDeleteAccount}
          onPageChange={setAccountPage}
          pinningId={pinningId}
          deletingId={deletingId}
        />

        <section className="content-stack">
          <section className="current-mailbox-card">
            <div className="current-mailbox-card__header">
              <div>
                <div className="badge-title">当前邮箱</div>
              </div>
              <div className="mailbox-flags">
                {detail?.has_oauth ? <span className="status-pill is-good">OAuth</span> : null}
                {detail?.has_password ? <span className="status-pill is-good">密码</span> : null}
                {detail && !detail.enabled ? <span className="status-pill is-muted">已停用</span> : null}
              </div>
            </div>

            <div className="mailbox-hero">{detail?.email || '导入邮箱后会显示在这里'}</div>

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
          </section>

          <MessageList
            title="收件与发件"
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

      <ShellModal
        open={importOpen}
        title="批量导入 Outlook"
        onClose={() => setImportOpen(false)}
        className="shell-modal--import"
        bodyClassName="shell-modal__body--import"
        footer={
          <>
            <button className="ghost-button" type="button" onClick={() => setImportOpen(false)}>
              取消
            </button>
            <button className="gradient-button" type="button" onClick={submitImport} disabled={busyAction === 'import'}>
              {busyAction === 'import' ? '导入中...' : '开始导入'}
            </button>
          </>
        }
      >
        <div className="import-modal__intro">
          <p className="modal-tip import-modal__tip">支持 `邮箱----密码----client_id----refresh_token`，也支持 JSON 数组。</p>
          <div className="import-modal__example">示例：example@outlook.com----password----client_id----refresh_token</div>
        </div>
        <textarea
          className="form-textarea import-modal__textarea"
          rows={10}
          value={importValue}
          onChange={(event) => setImportValue(event.target.value)}
          placeholder={'example@outlook.com----password----client_id----refresh_token'}
        />
        {importResult ? (
          <div className="result-box">
            新增 {importResult.created}，更新 {importResult.updated}，失败 {importResult.failed}
            {importResult.errors.length ? <pre>{importResult.errors.join('\n')}</pre> : null}
          </div>
        ) : null}
      </ShellModal>

      <ShellModal
        open={sendOpen}
        title="发送邮件"
        onClose={() => setSendOpen(false)}
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
        <div className="form-grid">
          <label>
            <span>收件人</span>
            <input value={sendForm.to} onChange={(event) => setSendForm({ ...sendForm, to: event.target.value })} />
          </label>
          <label>
            <span>抄送</span>
            <input value={sendForm.cc} onChange={(event) => setSendForm({ ...sendForm, cc: event.target.value })} />
          </label>
          <label>
            <span>密送</span>
            <input value={sendForm.bcc} onChange={(event) => setSendForm({ ...sendForm, bcc: event.target.value })} />
          </label>
          <label>
            <span>主题</span>
            <input value={sendForm.subject} onChange={(event) => setSendForm({ ...sendForm, subject: event.target.value })} />
          </label>
          <label className="form-span-full">
            <span>纯文本内容</span>
            <textarea
              className="form-textarea"
              rows={6}
              value={sendForm.body_text}
              onChange={(event) => setSendForm({ ...sendForm, body_text: event.target.value })}
            />
          </label>
          <label className="form-span-full">
            <span>HTML 内容（可选）</span>
            <textarea
              className="form-textarea"
              rows={6}
              value={sendForm.body_html}
              onChange={(event) => setSendForm({ ...sendForm, body_html: event.target.value })}
            />
          </label>
        </div>
      </ShellModal>

      <ShellModal
        open={shareOpen}
        title="临时授权"
        onClose={() => setShareOpen(false)}
        footer={
          <>
            <button className="ghost-button" type="button" onClick={() => setShareOpen(false)}>
              关闭
            </button>
            <button className="gradient-button" type="button" onClick={createShareLink} disabled={busyAction === 'share'}>
              {busyAction === 'share' ? '生成中...' : '生成链接'}
            </button>
          </>
        }
      >
        <label>
          <span>有效期（天）</span>
          <input type="number" min={1} max={365} value={shareDays} onChange={(event) => setShareDays(Number(event.target.value || 30))} />
        </label>
        {shareResult ? (
          <div className="result-box">
            <div>过期时间：{formatTime(shareResult.expires_at)}</div>
            <div className="share-link-row">
              <input value={shareResult.url} readOnly />
              <button className="ghost-button" type="button" onClick={() => copyText(shareResult.url).then(() => flash('success', '链接已复制')).catch(() => {})}>
                复制链接
              </button>
            </div>
          </div>
        ) : (
          <p className="modal-tip">默认 30 天有效。生成新链接时会覆盖上一条授权，旧链接将立即失效且不再更新邮件内容。</p>
        )}
      </ShellModal>

      <ShellModal
        open={Boolean(deleteTarget)}
        title="确认删除邮箱"
        onClose={() => {
          if (!deletingId) {
            setDeleteTarget(null)
          }
        }}
        className="shell-modal--danger-confirm"
        bodyClassName="shell-modal__body--danger-confirm"
        closeMode="icon"
        footer={
          <button className="gradient-button danger-action-button" type="button" onClick={confirmDeleteAccount} disabled={Boolean(deletingId)}>
            {deletingId ? '删除中...' : '确认删除'}
          </button>
        }
      >
        <div className="danger-confirm">
          <div className="danger-confirm__badge">高风险操作</div>
          <h4 className="danger-confirm__title">删除后不可恢复</h4>
          <p className="danger-confirm__text">会一并清空该邮箱的本地邮件缓存和临时授权链接。</p>
          <div className="danger-confirm__target">{deleteTarget ? deleteTarget.email : '请选择需要删除的邮箱'}</div>
          <div className="danger-confirm__hint">点击右上角关闭按钮或遮罩可取消本次删除。</div>
        </div>
      </ShellModal>
    </div>
  )
}
