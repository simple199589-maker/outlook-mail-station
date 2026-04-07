import { formatSender, formatTime } from '@/lib/api'
import { MessageItem } from '@/types'

/**
 * AI by zb: 渲染收件箱与发件箱列表。
 */
export function MessageList({
  messages,
  countdown,
  folder,
  onFolderChange,
  onSelectMessage,
}: {
  messages: MessageItem[]
  countdown: number
  folder: 'inbox' | 'sent'
  onFolderChange: (folder: 'inbox' | 'sent') => void
  onSelectMessage: (id: number) => void
}) {
  return (
    <section className="message-board">
      <div className="message-board__header message-board__header--compact">
        <div className="folder-toggle">
          <button
            type="button"
            className={folder === 'inbox' ? 'is-active' : ''}
            onClick={() => onFolderChange('inbox')}
          >
            收件箱
          </button>
          <button
            type="button"
            className={folder === 'sent' ? 'is-active' : ''}
            onClick={() => onFolderChange('sent')}
          >
            发件箱
          </button>
        </div>
        <div className="message-board__actions">
          <div className="refresh-chip">{countdown}s 后自动刷新</div>
        </div>
      </div>

      <div className="message-list">
        {messages.map((message) => (
          <button
            key={message.id}
            type="button"
            className="message-card"
            onClick={() => onSelectMessage(message.id)}
          >
            <div className="message-card__row">
              <span className="message-label">{folder === 'inbox' ? '发件人' : '收件人'}</span>
              <span className="message-value">
                {folder === 'inbox'
                  ? formatSender(message.sender_name, message.sender_email)
                  : message.recipient_summary || '仅当前邮箱'}
              </span>
              <span className="message-time">{formatTime(message.sent_at)}</span>
            </div>
            <div className="message-card__row">
              <span className="message-label">主题</span>
              <strong className="message-subject">{message.subject || '无主题'}</strong>
            </div>
            <div className="message-card__row">
              <span className="message-label">内容</span>
              <span className="message-preview">{message.preview || '暂无摘要'}</span>
            </div>
          </button>
        ))}
        {messages.length === 0 ? <div className="empty-block">这个文件夹还没有同步到邮件。</div> : null}
      </div>
    </section>
  )
}
