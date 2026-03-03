import { createPortal } from 'react-dom'

function MessageContextMenu({
  open,
  x,
  y,
  menuRef,
  onEdit,
  onDelete,
  disabledEdit = false,
  disabledDelete = false,
}) {
  if (!open) {
    return null
  }

  return createPortal(
    <div
      ref={menuRef}
      className="chat-message-context-menu"
      style={{
        top: `${y}px`,
        left: `${x}px`,
      }}
      role="menu"
      aria-label="메시지 옵션"
    >
      <button
        type="button"
        className="chat-message-context-item"
        onClick={onEdit}
        disabled={disabledEdit}
      >
        수정
      </button>
      <button
        type="button"
        className="chat-message-context-item danger"
        onClick={onDelete}
        disabled={disabledDelete}
      >
        삭제
      </button>
    </div>,
    document.body,
  )
}

export default MessageContextMenu
