import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { MessageDetailModal } from '@/components/MessageDetailModal'
import { MessageList } from '@/components/MessageList'
import { apiFetch, formatTime } from '@/lib/api'
import { MessageDetail, MessageItem, PublicSharePayload } from '@/types'


const AUTO_REFRESH_SECONDS = 10


/**
 * AI by zb: 无需登录即可访问的临时授权页面。
 */
export function PublicSharePage() {
  const { token = '' } = useParams()
  const [payload, setPayload] = useState<PublicSharePayload | null>(null)
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox')
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null)
  const [messageOpen, setMessageOpen] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS)
  const [error, setError] = useState('')

  /**
   * AI by zb: 拉取公开分享页面的邮箱与邮件内容。
   */
  const loadShare = async () => {
    try {
      const data = await apiFetch<PublicSharePayload>(`/api/public/shares/${token}`)
      setPayload(data)
      const nextMessages = folder === 'inbox' ? data.inbox : data.sent
      setMessages(nextMessages)
      setSelectedMessage(null)
      setMessageOpen(false)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }

  /**
   * AI by zb: 打开公开页中的邮件详情。
   */
  const openMessage = async (messageId: number) => {
    const detail = await apiFetch<MessageDetail>(`/api/public/shares/${token}/messages/${messageId}`)
    setSelectedMessage(detail)
    setMessageOpen(true)
  }

  /**
   * AI by zb: 通过分享令牌触发后端只读刷新。
   */
  const syncShare = async () => {
    try {
      const data = await apiFetch<PublicSharePayload>(`/api/public/shares/${token}/sync`, { method: 'POST' })
      setPayload(data)
      const nextMessages = folder === 'inbox' ? data.inbox : data.sent
      setMessages(nextMessages)
      setCountdown(AUTO_REFRESH_SECONDS)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError))
    }
  }

  useEffect(() => {
    loadShare().catch(() => {})
  }, [token, folder])

  useEffect(() => {
    if (error) return
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          syncShare().catch(() => {})
          return AUTO_REFRESH_SECONDS
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [token, folder, error])

  if (error) {
    return (
      <div className="public-shell">
        <div className="public-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="public-shell">
      <header className="public-header">
        <div>
          <div className="brand-mark">Public Share</div>
          <h1>{payload?.account.email || '加载中...'}</h1>
          <p>链接过期时间：{payload ? formatTime(payload.expires_at) : '读取中'}</p>
        </div>
      </header>

      <MessageList
        messages={messages}
        countdown={countdown}
        folder={folder}
        onFolderChange={(nextFolder) => {
          setFolder(nextFolder)
          setMessages(nextFolder === 'inbox' ? payload?.inbox || [] : payload?.sent || [])
        }}
        onSelectMessage={openMessage}
      />

      <MessageDetailModal
        open={messageOpen}
        message={selectedMessage}
        onClose={() => setMessageOpen(false)}
        onFlash={() => {}}
      />
    </div>
  )
}
