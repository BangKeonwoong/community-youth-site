import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ErrorBanner from '../components/common/ErrorBanner'
import { useAuth } from '../hooks/useAuth'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signInWithEmail } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const successMessage = location.state?.message ?? ''

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    const { error: signInError } = await signInWithEmail({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setIsSubmitting(false)
      return
    }

    const redirectPath = location.state?.from?.pathname ?? '/'
    navigate(redirectPath, { replace: true })
  }

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass animate-fade-in" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '420px' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>환영합니다</h1>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '1.5rem' }}>
          중고등부 커뮤니티에 로그인하세요
        </p>

        {successMessage && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #bbf7d0',
              backgroundColor: '#f0fdf4',
              color: '#166534',
              fontSize: '0.875rem',
            }}
          >
            {successMessage}
          </div>
        )}
        <ErrorBanner message={error} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="login-email" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              이메일
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div>
            <label htmlFor="login-password" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              비밀번호
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '0.5rem', width: '100%', opacity: isSubmitting ? 0.8 : 1 }}>
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          초대받은 사용자라면{' '}
          <Link to="/invite" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
            비밀번호 설정
          </Link>
          을 먼저 진행하세요.
        </p>
      </div>
    </div>
  )
}

export default Login
