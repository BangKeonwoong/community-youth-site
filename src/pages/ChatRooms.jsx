import { useMemo, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import ErrorBanner from '../components/common/ErrorBanner'
import { useChatPage } from '../features/chat/hooks'

const EMPTY_ROOM_FORM = {
  name: '',
  description: '',
}

function isSubmitEnter(event) {
  return event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing
}

function formatDateTime(value) {
  if (!value) {
    return '시간 미정'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '시간 미정'
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
    <div className="glass chat-info-banner">
      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Supabase 연결 필요</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</p>
    </div>
  )
}

function ChatRooms() {
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM_FORM)
  const [messageDraft, setMessageDraft] = useState('')
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [feedback, setFeedback] = useState('')

  const {
    supabaseStatus,
    profile,
    rooms,
    activeRoomId,
    messages,
    isLoading,
    isMessagesLoading,
    error,
    createRoom,
    deleteRoom,
    sendMessage,
    updateMessage,
    deleteMessage,
    isSubmitting,
  } = useChatPage({ selectedRoomId })

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || null,
    [activeRoomId, rooms],
  )

  const handleCreateRoom = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      await createRoom(roomForm)
      setRoomForm(EMPTY_ROOM_FORM)
      setIsCreateFormOpen(false)
      setFeedback('채팅방이 생성되었습니다.')
    } catch (createError) {
      setFeedback(createError.message)
    }
  }

  const handleDeleteRoom = async (room) => {
    if (!window.confirm(`채팅방 "${room.name}"을(를) 삭제하시겠어요?`)) {
      return
    }

    setFeedback('')

    try {
      await deleteRoom(room.id)
      setFeedback('채팅방을 삭제했습니다.')
      if (activeRoomId === room.id) {
        setSelectedRoomId(null)
      }
    } catch (deleteError) {
      setFeedback(deleteError.message)
    }
  }

  const handleSendMessage = async (event) => {
    event.preventDefault()
    if (!activeRoomId) {
      return
    }

    setFeedback('')

    try {
      await sendMessage({ roomId: activeRoomId, content: messageDraft })
      setMessageDraft('')
    } catch (sendError) {
      setFeedback(sendError.message)
    }
  }

  const handleEditMessage = async (event, messageId) => {
    event.preventDefault()
    setFeedback('')

    try {
      await updateMessage({ messageId, content: editingDraft })
      setEditingMessageId(null)
      setEditingDraft('')
    } catch (updateError) {
      setFeedback(updateError.message)
    }
  }

  const handleDeleteMessage = async (message) => {
    if (!window.confirm('이 메시지를 삭제하시겠어요?')) {
      return
    }

    setFeedback('')

    try {
      await deleteMessage(message.id)
      if (editingMessageId === message.id) {
        setEditingMessageId(null)
        setEditingDraft('')
      }
    } catch (deleteError) {
      setFeedback(deleteError.message)
    }
  }

  const handleComposeKeyDown = (event) => {
    if (!isSubmitEnter(event)) {
      return
    }

    event.preventDefault()

    if (isSubmitting || !activeRoomId || !messageDraft.trim()) {
      return
    }

    event.currentTarget.form?.requestSubmit()
  }

  const handleEditKeyDown = (event) => {
    if (!isSubmitEnter(event)) {
      return
    }

    event.preventDefault()

    if (isSubmitting || !editingDraft.trim()) {
      return
    }

    event.currentTarget.form?.requestSubmit()
  }

  return (
    <div className="animate-fade-in page-stack chat-page">
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.35rem' }}>실시간 채팅</h1>
        <p style={{ color: 'var(--text-secondary)' }}>채팅방을 만들고 디스코드처럼 실시간으로 대화하세요.</p>
        {profile ? (
          <p style={{ marginTop: '0.35rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            {profile.displayName} ({profile.role})
          </p>
        ) : null}
      </header>

      {!supabaseStatus.configured ? <InfoBanner message={supabaseStatus.message} /> : null}

      <ErrorBanner message={error?.message || ''} />
      <ErrorBanner message={feedback} />

      <section className="glass chat-shell">
        <aside className="chat-room-sidebar">
          <div className="chat-room-sidebar-header">
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>채팅방</h2>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFeedback('')
                setIsCreateFormOpen((prev) => !prev)
              }}
              disabled={!supabaseStatus.configured || isSubmitting}
            >
              {isCreateFormOpen ? '닫기' : '방 만들기'}
            </button>
          </div>

          {isCreateFormOpen ? (
            <form className="chat-room-create-form" onSubmit={handleCreateRoom}>
              <input
                value={roomForm.name}
                onChange={(event) => setRoomForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="채팅방 이름"
                required
              />
              <textarea
                rows={2}
                value={roomForm.description}
                onChange={(event) => setRoomForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="채팅방 설명 (선택)"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? '생성 중...' : '생성'}
                </button>
              </div>
            </form>
          ) : null}

          {isLoading ? (
            <p style={{ color: 'var(--text-secondary)' }}>채팅방 목록을 불러오는 중입니다...</p>
          ) : rooms.length === 0 ? (
            <EmptyState title="채팅방이 없습니다." description="첫 채팅방을 만들어 대화를 시작하세요." />
          ) : (
            <div className="chat-room-list">
              {rooms.map((room) => {
                const isSelected = room.id === activeRoomId

                return (
                  <button
                    key={room.id}
                    type="button"
                    className={`chat-room-list-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedRoomId(room.id)}
                  >
                    <div className="chat-room-list-item-title-row">
                      <p style={{ fontWeight: 700 }}>{room.name}</p>
                      {room.lastMessageAt ? (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>
                          {formatDateTime(room.lastMessageAt)}
                        </span>
                      ) : null}
                    </div>
                    {room.description ? (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{room.description}</p>
                    ) : null}
                    {room.latestMessagePreview ? (
                      <p className="chat-room-list-item-preview">{room.latestMessagePreview}</p>
                    ) : (
                      <p className="chat-room-list-item-preview">아직 메시지가 없습니다.</p>
                    )}
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                      생성자: {room.createdByName}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        <div className="chat-room-main">
          {!selectedRoom ? (
            <EmptyState title="채팅방을 선택하세요." description="왼쪽 목록에서 채팅방을 선택하면 메시지를 볼 수 있습니다." />
          ) : (
            <>
              <div className="chat-room-main-header">
                <div>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{selectedRoom.name}</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {selectedRoom.description || '설명 없음'}
                  </p>
                </div>

                {profile && (profile.role === 'admin' || selectedRoom.createdBy === profile.id) ? (
                  <button
                    type="button"
                    className="btn-secondary admin-danger-button"
                    onClick={() => handleDeleteRoom(selectedRoom)}
                    disabled={!supabaseStatus.configured || isSubmitting}
                  >
                    {isSubmitting ? '처리 중...' : '방 삭제'}
                  </button>
                ) : null}
              </div>

              <div className="chat-message-list">
                {isMessagesLoading ? (
                  <p style={{ color: 'var(--text-secondary)' }}>메시지를 불러오는 중입니다...</p>
                ) : messages.length === 0 ? (
                  <EmptyState title="메시지가 없습니다." description="첫 메시지를 보내보세요." />
                ) : (
                  messages.map((message) => {
                    const canManage = Boolean(
                      profile && (profile.role === 'admin' || (message.authorId && profile.id === message.authorId)),
                    )
                    const isEditing = editingMessageId === message.id

                    return (
                      <article key={message.id} className="chat-message-item">
                        <div className="chat-message-meta">
                          <p style={{ fontWeight: 700 }}>{message.authorName}</p>
                          <span>{formatDateTime(message.createdAt)}</span>
                          {message.editedAt ? <span>수정됨</span> : null}
                        </div>

                        {isEditing ? (
                          <form className="chat-message-edit-form" onSubmit={(event) => handleEditMessage(event, message.id)}>
                            <textarea
                              rows={3}
                              value={editingDraft}
                              onChange={(event) => setEditingDraft(event.target.value)}
                              onKeyDown={handleEditKeyDown}
                              required
                            />
                            <div className="chat-message-edit-actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                  setEditingMessageId(null)
                                  setEditingDraft('')
                                }}
                                disabled={isSubmitting}
                              >
                                취소
                              </button>
                              <button type="submit" className="btn-primary" disabled={isSubmitting || !editingDraft.trim()}>
                                {isSubmitting ? '저장 중...' : '저장'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <p className="chat-message-content">
                            {message.isDeleted ? '삭제된 메시지입니다.' : message.content || '삭제된 메시지입니다.'}
                          </p>
                        )}

                        {!isEditing ? (
                          <div className="chat-message-actions">
                            {canManage ? (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                  setEditingMessageId(message.id)
                                  setEditingDraft(message.content || '')
                                }}
                                disabled={isSubmitting || message.isDeleted}
                              >
                                수정
                              </button>
                            ) : null}
                            {canManage ? (
                              <button
                                type="button"
                                className="btn-secondary admin-danger-button"
                                onClick={() => handleDeleteMessage(message)}
                                disabled={isSubmitting || message.isDeleted}
                              >
                                삭제
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    )
                  })
                )}
              </div>

              <form className="chat-message-compose-form" onSubmit={handleSendMessage}>
                <textarea
                  rows={3}
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={handleComposeKeyDown}
                  placeholder="메시지를 입력하세요"
                  required
                  disabled={!supabaseStatus.configured || isSubmitting || !activeRoomId}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!supabaseStatus.configured || isSubmitting || !activeRoomId || !messageDraft.trim()}
                  >
                    {isSubmitting ? '전송 중...' : '전송'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default ChatRooms
