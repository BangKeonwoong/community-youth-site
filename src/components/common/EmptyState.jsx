function EmptyState({ title = '데이터가 없습니다.', description = '', actionLabel = '', onAction }) {
  return (
    <div
      style={{
        padding: '2rem',
        border: '1px dashed var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        textAlign: 'center',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>{title}</h3>
      {description && <p style={{ color: 'var(--text-secondary)', marginBottom: actionLabel ? '1rem' : '0' }}>{description}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn-primary">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export default EmptyState
