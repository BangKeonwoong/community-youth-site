import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import ErrorBanner from '../components/common/ErrorBanner'
import ChatComposer from '../features/chat/components/ChatComposer'
import ChatMessageItem from '../features/chat/components/ChatMessageItem'
import MessageContextMenu from '../features/chat/components/MessageContextMenu'
import { useLongPressContextMenu } from '../features/chat/hooks/useLongPressContextMenu'
import { useMessageActionMenu } from '../features/chat/hooks/useMessageActionMenu'
import { useChatPage } from '../features/chat/hooks'
import { formatChatDateTime, isSubmitEnter } from '../features/chat/utils/chatUi'

const EMPTY_ROOM_FORM = {
  name: '',
  description: '',
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

  const composeTextareaRef = useRef(null)
  const messageListRef = useRef(null)
  const shouldScrollOnSentMessageRef = useRef(false)

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
    retryFailedMessage,
    updateMessage,
    deleteMessage,
    isRoomSubmitting,
    isMessageSending,
    isMessageMutating,
  } = useChatPage({ selectedRoomId })

  const {
    menu: messageActionMenu,
    menuRef: messageActionMenuRef,
    selectedMessage: selectedContextMessage,
    openMenu: openMessageActionMenu,
    closeMenu: closeMessageActionMenu,
  } = useMessageActionMenu(messages)

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || null,
    [activeRoomId, rooms],
  )

  const focusComposeInput = useCallback(() => {
    if (!activeRoomId) {
      return
    }

    requestAnimationFrame(() => {
      composeTextareaRef.current?.focus()
    })
  }, [activeRoomId])

  useEffect(() => {
    focusComposeInput()
  }, [focusComposeInput])

  useEffect(() => {
    if (!shouldScrollOnSentMessageRef.current) {
      return
    }

    const listElement = messageListRef.current
    if (!listElement) {
      return
    }

    requestAnimationFrame(() => {
      listElement.scrollTop = listElement.scrollHeight
      shouldScrollOnSentMessageRef.current = false
    })
  }, [messages.length])

  const handleLongPressOpen = useCallback(
    ({ payload, x, y }) => {
      const message = payload?.message
      const canManage = payload?.canManage

      const isServerSynced = (message?.sendState || 'sent') === 'sent'
      if (!message || !canManage || !isServerSynced || message.isDeleted || editingMessageId === message.id) {
        return
      }

      openMessageActionMenu({ messageId: message.id, x, y })
    },
    [editingMessageId, openMessageActionMenu],
  )

  const longPressContextMenu = useLongPressContextMenu(handleLongPressOpen)

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

  const handleSendMessage = (event) => {
    event.preventDefault()
    if (!activeRoomId) {
      return
    }

    const draft = messageDraft
    if (!draft.trim()) {
      return
    }

    setFeedback('')
    shouldScrollOnSentMessageRef.current = true
    setMessageDraft('')
    closeMessageActionMenu()
    focusComposeInput()

    sendMessage({ roomId: activeRoomId, content: draft }).catch((sendError) => {
      setFeedback(sendError.message)
    })
  }

  const handleEditMessage = async (event, messageId) => {
    event.preventDefault()
    setFeedback('')

    try {
      await updateMessage({ messageId, content: editingDraft, roomId: activeRoomId })
      setEditingMessageId(null)
      setEditingDraft('')
      closeMessageActionMenu()
    } catch (updateError) {
      setFeedback(updateError.message)
    }
  }

  const handleDeleteMessage = async (message) => {
    if (!window.confirm('이 메시지를 삭제하시겠어요?')) {
      return
    }

    setFeedback('')
    closeMessageActionMenu()

    try {
      await deleteMessage({ messageId: message.id, roomId: activeRoomId })
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

    if (!activeRoomId || !messageDraft.trim()) {
      return
    }

    event.currentTarget.form?.requestSubmit()
  }

  const handleEditKeyDown = (event) => {
    if (!isSubmitEnter(event)) {
      return
    }

    event.preventDefault()

    if (isMessageMutating || !editingDraft.trim()) {
      return
    }

    event.currentTarget.form?.requestSubmit()
  }

  const handleMessageContextMenu = (event, message, canManage) => {
    const isServerSynced = (message?.sendState || 'sent') === 'sent'
    if (!canManage || !isServerSynced || message.isDeleted || editingMessageId === message.id) {
      return
    }

    event.preventDefault()
    openMessageActionMenu({
      messageId: message.id,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const handleMessageTouchStart = (event, message, canManage) => {
    const isServerSynced = (message?.sendState || 'sent') === 'sent'
    const enabled = Boolean(canManage && isServerSynced && !message.isDeleted && editingMessageId !== message.id)
    longPressContextMenu.onTouchStart(event, { message, canManage }, enabled)
  }

  const handleContextEdit = () => {
    if (
      !selectedContextMessage ||
      selectedContextMessage.isDeleted ||
      (selectedContextMessage.sendState || 'sent') !== 'sent'
    ) {
      closeMessageActionMenu()
      return
    }

    setEditingMessageId(selectedContextMessage.id)
    setEditingDraft(selectedContextMessage.content || '')
    closeMessageActionMenu()
  }

  const handleContextDelete = () => {
    if (
      !selectedContextMessage ||
      selectedContextMessage.isDeleted ||
      (selectedContextMessage.sendState || 'sent') !== 'sent'
    ) {
      closeMessageActionMenu()
      return
    }

    handleDeleteMessage(selectedContextMessage)
  }

  const handleRetryMessage = async (messageId) => {
    shouldScrollOnSentMessageRef.current = true
    setFeedback('')

    try {
      await retryFailedMessage(messageId)
      focusComposeInput()
    } catch (retryError) {
      setFeedback(retryError.message)
    }
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
              disabled={!supabaseStatus.configured || isRoomSubmitting}
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
                <button type="submit" className="btn-primary" disabled={isRoomSubmitting}>
                  {isRoomSubmitting ? '생성 중...' : '생성'}
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
                          {formatChatDateTime(room.lastMessageAt)}
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
                    disabled={!supabaseStatus.configured || isRoomSubmitting}
                  >
                    {isRoomSubmitting ? '처리 중...' : '방 삭제'}
                  </button>
                ) : null}
              </div>

              <div
                className="chat-message-list"
                ref={messageListRef}
                onScroll={() => {
                  if (messageActionMenu.open) {
                    closeMessageActionMenu()
                  }
                }}
              >
                {isMessagesLoading ? (
                  <p style={{ color: 'var(--text-secondary)' }}>메시지를 불러오는 중입니다...</p>
                ) : messages.length === 0 ? (
                  <EmptyState title="메시지가 없습니다." description="첫 메시지를 보내보세요." />
                ) : (
                  messages.map((message) => {
                    const canManage = Boolean(
                      profile && (profile.role === 'admin' || (message.authorId && profile.id === message.authorId)),
                    )

                    return (
                      <ChatMessageItem
                        key={message.id}
                        message={message}
                        canManage={canManage}
                        isEditing={editingMessageId === message.id}
                        isSubmitting={isMessageMutating}
                        isContextOpen={messageActionMenu.open && messageActionMenu.messageId === message.id}
                        editingDraft={editingDraft}
                        onEditingDraftChange={setEditingDraft}
                        onEditSubmit={handleEditMessage}
                        onEditKeyDown={handleEditKeyDown}
                        onEditCancel={() => {
                          setEditingMessageId(null)
                          setEditingDraft('')
                        }}
                        onContextMenu={handleMessageContextMenu}
                        onTouchStart={handleMessageTouchStart}
                        onTouchMove={longPressContextMenu.onTouchMove}
                        onTouchEnd={longPressContextMenu.onTouchEnd}
                        onTouchCancel={longPressContextMenu.onTouchCancel}
                        onRetry={handleRetryMessage}
                      />
                    )
                  })
                )}
              </div>

              <ChatComposer
                textareaRef={composeTextareaRef}
                value={messageDraft}
                onChange={setMessageDraft}
                onKeyDown={handleComposeKeyDown}
                onSubmit={handleSendMessage}
                disabled={!supabaseStatus.configured || !activeRoomId}
                isSending={isMessageSending}
              />

              <MessageContextMenu
                open={messageActionMenu.open && Boolean(selectedContextMessage)}
                x={messageActionMenu.x}
                y={messageActionMenu.y}
                menuRef={messageActionMenuRef}
                onEdit={handleContextEdit}
                onDelete={handleContextDelete}
                disabledEdit={
                  isMessageMutating ||
                  !selectedContextMessage ||
                  selectedContextMessage.isDeleted ||
                  (selectedContextMessage.sendState || 'sent') !== 'sent'
                }
                disabledDelete={
                  isMessageMutating ||
                  !selectedContextMessage ||
                  selectedContextMessage.isDeleted ||
                  (selectedContextMessage.sendState || 'sent') !== 'sent'
                }
              />
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default ChatRooms
