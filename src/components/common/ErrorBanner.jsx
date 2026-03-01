function ErrorBanner({ message }) {
  if (!message) {
    return null
  }

  return (
    <div
      style={{
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid #fecaca',
        backgroundColor: '#fef2f2',
        color: '#991b1b',
        fontSize: '0.875rem',
      }}
    >
      {message}
    </div>
  )
}

export default ErrorBanner
