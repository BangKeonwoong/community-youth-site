import { useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import ErrorBanner from '../components/common/ErrorBanner'
import { useMessagesPage } from '../features/messages/hooks'

const MESSAGE_TABS = [
  { id: 'inbox', label: '받은 메시지' },
  { id: 'outbox', label: '보낸 메시지' },
]

function formatDateTime(value) {
  if (!value) {
    return '시간 정보 없음'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '시간 정보 없음'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function InfoBanner({ message }) {
  return (
    <div
      className="glass"
      style={{
        marginBottom: '1rem',
        padding: '1rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid #f59e0b',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Supabase 연결 필요</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</p>
    </div>
  )
}

function Messages() {
  const [scope, setScope] = useState('inbox')
  const [includeAll, setIncludeAll] = useState(false)
  const [feedback, setFeedback] = useState('')

  const { supabaseStatus, profile, isAdmin, messages, isLoading, error, markBirthdayMessageRead, isSubmitting } =
    useMessagesPage({ scope, includeAll })

  const handleMarkRead = async (messageId) => {
    setFeedback('')

    try {
      await markBirthdayMessageRead(messageId)
      setFeedback('메시지를 읽음 처리했습니다.')
    } catch (markError) {
      setFeedback(markError.message)
    }
  }

  return (
    <div className="animate-fade-in page-stack messages-page">
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.35rem' }}>메시지</h1>
        <p style={{ color: 'var(--text-secondary)' }}>생일 축하 메시지의 수신/발신 내역을 확인하세요.</p>
        {profile ? (
          <p style={{ marginTop: '0.35rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            {profile.displayName} ({profile.role})
          </p>
        ) : null}
      </header>

      {!supabaseStatus.configured ? <InfoBanner message={supabaseStatus.message} /> : null}

      <ErrorBanner message={error?.message || ''} />
      <ErrorBanner message={feedback} />

      <section className="glass messages-card">
        <div className="messages-toolbar">
          <div className="messages-tabs" role="tablist" aria-label="메시지 범위">
            {MESSAGE_TABS.map((tab) => {
              const isActive = tab.id === scope

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`messages-tab ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setScope(tab.id)
                    setFeedback('')
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {isAdmin ? (
            <label className="messages-admin-toggle" htmlFor="messages-admin-all-toggle">
              <input
                id="messages-admin-all-toggle"
                type="checkbox"
                checked={includeAll}
                onChange={(event) => setIncludeAll(event.target.checked)}
              />
              전체 보기 (관리자)
            </label>
          ) : null}
        </div>

        {isLoading ? (
          <p style={{ color: 'var(--text-secondary)' }}>메시지를 불러오는 중입니다...</p>
        ) : messages.length === 0 ? (
          <EmptyState title="표시할 메시지가 없습니다." description="새 메시지가 오면 이곳에서 확인할 수 있습니다." />
        ) : (
          <div className="message-list">
            {messages.map((message) => {
              const isUnreadInbox = scope === 'inbox' && !message.isRead

              return (
                <article key={message.id} className={`message-row ${isUnreadInbox ? 'unread' : ''}`}>
                  <header className="message-row-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {isUnreadInbox ? (
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent-primary)',
                          flexShrink: 0
                        }}></div>
                      ) : null}
                      <div style={{ display: 'grid', gap: '0.12rem' }}>
                        <p style={{ fontWeight: isUnreadInbox ? 700 : 600, color: isUnreadInbox ? 'var(--accent-primary)' : 'inherit' }}>
                          {scope === 'inbox' ? `보낸 사람: ${message.senderName}` : `받는 사람: ${message.receiverName}`}
                        </p>
                        {isAdmin && includeAll ? (
                          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                            {message.senderName} → {message.receiverName}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: isUnreadInbox ? 'var(--accent-primary)' : 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: isUnreadInbox ? 600 : 400 }}>
                        {formatDateTime(message.createdAt)}
                      </p>
                      {scope === 'inbox' ? (
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                          {message.isRead ? `읽음: ${formatDateTime(message.readAt)}` : '새 메시지'}
                        </p>
                      ) : null}
                    </div>
                  </header>

                  <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{message.content || '(내용 없음)'}</p>

                  {isUnreadInbox ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleMarkRead(message.id)}
                        disabled={!supabaseStatus.configured || isSubmitting}
                      >
                        {isSubmitting ? '처리 중...' : '읽음 처리'}
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default Messages
