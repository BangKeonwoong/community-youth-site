function LoadingState({ title = '로딩 중...', description = '' }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '2rem',
            height: '2rem',
            borderRadius: '999px',
            border: '3px solid var(--border-color)',
            borderTopColor: 'var(--accent-primary)',
            margin: '0 auto 1rem',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <h2 style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>{title}</h2>
        {description && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{description}</p>}
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}

export default LoadingState
