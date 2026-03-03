import Avatar from '../../../components/common/Avatar'
import { formatChatDateTime } from '../utils/chatUi'

function ChatMessageItem({
  message,
  canManage,
  isEditing,
  isSubmitting,
  isContextOpen,
  editingDraft,
  onEditingDraftChange,
  onEditSubmit,
  onEditKeyDown,
  onEditCancel,
  onContextMenu,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  onRetry,
}) {
  const alignmentClass = message.isMine ? 'mine' : 'other'
  const sendState = message.sendState || 'sent'
  const isSending = sendState === 'sending'
  const isFailed = sendState === 'failed'

  return (
    <div
      className={`chat-message-wrapper ${alignmentClass} ${isEditing ? 'editing' : ''} ${
        isContextOpen ? 'context-open' : ''
      }`}
      onContextMenu={(event) => onContextMenu(event, message, canManage)}
      onTouchStart={(event) => onTouchStart(event, message, canManage)}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {!message.isMine ? <Avatar name={message.authorName} size={36} style={{ marginTop: '0.15rem' }} /> : null}
      <article className={`chat-message-item ${alignmentClass} ${isEditing ? 'editing' : ''}`}>
        <div className={`chat-message-meta ${alignmentClass}`}>
          {!message.isMine ? <p style={{ fontWeight: 700 }}>{message.authorName}</p> : null}
          <span>{formatChatDateTime(message.createdAt)}</span>
          {message.editedAt ? <span>수정됨</span> : null}
        </div>

        {isEditing ? (
          <form className="chat-message-edit-form" onSubmit={(event) => onEditSubmit(event, message.id)}>
            <textarea
              rows={3}
              value={editingDraft}
              onChange={(event) => onEditingDraftChange(event.target.value)}
              onKeyDown={onEditKeyDown}
              required
            />
            <div className="chat-message-edit-actions">
              <button type="button" className="btn-secondary" onClick={onEditCancel} disabled={isSubmitting}>
                취소
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting || !editingDraft.trim()}>
                {isSubmitting ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="chat-message-content">
              {message.isDeleted ? '삭제된 메시지입니다.' : message.content || '삭제된 메시지입니다.'}
            </p>
            {message.isMine && !message.isDeleted && (isSending || isFailed) ? (
              <div className="chat-message-delivery-row">
                {isSending ? <span className="chat-message-delivery sending">전송 중...</span> : null}
                {isFailed ? (
                  <span className="chat-message-delivery failed">
                    {message.sendError || '전송에 실패했습니다.'}
                  </span>
                ) : null}
                {isFailed ? (
                  <button
                    type="button"
                    className="chat-message-retry-button"
                    onClick={() => onRetry?.(message.id)}
                    disabled={isSubmitting}
                  >
                    재전송
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </article>
    </div>
  )
}

export default ChatMessageItem
