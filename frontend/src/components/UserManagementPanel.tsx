import { formatTime } from '@/lib/api'
import { UserItem } from '@/types'

/**
 * AI by zb: 格式化用户列表中的最后导入时间文案。
 */
function formatImportTime(value?: string | null) {
  return value ? formatTime(value) : '未导入'
}

/**
 * AI by zb: 渲染管理员用户管理表格面板。
 */
export function UserManagementPanel({
  users,
  activeUserId,
  actionLoading,
  onCreateUser,
  onOpenUserApiKey,
  onToggleUserEnabled,
  onSelectUser,
  onOpenUserDetail,
}: {
  users: UserItem[]
  activeUserId: number | null
  actionLoading: string
  onCreateUser: () => void
  onOpenUserApiKey: (userId: number) => void
  onToggleUserEnabled: (user: UserItem) => void
  onSelectUser: (userId: number) => void
  onOpenUserDetail: (userId: number) => void
}) {
  return (
    <section className="dashboard-card user-panel user-table-panel">
      <div className="dashboard-card__header user-panel__header user-table-panel__header">
        <div className="user-panel__header-main">
          <span className="section-kicker">用户池</span>
        </div>
        <div className="user-panel__header-actions">
          <button className="gradient-button user-panel__create-button" type="button" onClick={onCreateUser}>
            新增用户
          </button>
        </div>
      </div>

      <div className="user-table-panel__wrap">
        <div className="user-table-panel__head">
          <span>用户</span>
          <span>状态</span>
          <span>池内邮箱</span>
          <span>已消费</span>
          <span>最后导入</span>
          <span>操作</span>
        </div>
        <div className="user-table-panel__body">
          {users.map((user) => {
            const isProcessing = actionLoading === `user-${user.id}`
            const isActive = activeUserId === user.id
            return (
              <div
                key={user.id}
                className={`user-table-panel__row ${isActive ? 'is-active' : ''}`}
                onClick={() => onSelectUser(user.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectUser(user.id)
                  }
                }}
              >
                <span className="user-table-panel__cell user-table-panel__user">
                  <strong>{user.username}</strong>
                  <small>{isActive ? '当前目标用户池' : '点击切换'}</small>
                </span>
                <span className="user-table-panel__cell">
                  <span className={`status-pill ${user.enabled ? 'is-good' : 'is-muted'}`}>{user.enabled ? '启用' : '禁用'}</span>
                </span>
                <span className="user-table-panel__cell user-table-panel__number">{user.pool_count}</span>
                <span className="user-table-panel__cell user-table-panel__number">{user.consumed_count}</span>
                <span className="user-table-panel__cell user-table-panel__time">{formatImportTime(user.last_imported_at)}</span>
                <span className="user-table-panel__cell user-table-panel__action" onClick={(event) => event.stopPropagation()}>
                  <button
                    className="ghost-button user-table-panel__toggle-button"
                    type="button"
                    onClick={() => onOpenUserApiKey(user.id)}
                  >
                    API Key
                  </button>
                  <button
                    className="ghost-button user-table-panel__toggle-button"
                    type="button"
                    onClick={() => onOpenUserDetail(user.id)}
                  >
                    详情
                  </button>
                  <button
                    className="ghost-button user-table-panel__toggle-button"
                    type="button"
                    onClick={() => onToggleUserEnabled(user)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? '处理中...' : user.enabled ? '禁用' : '启用'}
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
