function ChatComposer({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  onSubmit,
  disabled,
  isSending,
}) {
  return (
    <form className="chat-message-compose-form" onSubmit={onSubmit}>
      <textarea
        ref={textareaRef}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="메시지를 입력하세요"
        required
        disabled={disabled}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          className="btn-primary"
          disabled={disabled || !value.trim()}
        >
          {isSending ? '전송 중...' : '전송'}
        </button>
      </div>
    </form>
  )
}

export default ChatComposer
