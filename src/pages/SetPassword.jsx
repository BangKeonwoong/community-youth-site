import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ErrorBanner from '../components/common/ErrorBanner'
import { useAuth } from '../hooks/useAuth'

function SetPassword() {
  const navigate = useNavigate()
  const { signUpWithInvite } = useAuth()

  const [inviteCode, setInviteCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }

    if (password !== confirmPassword) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setIsSubmitting(true)
    const { data, error: signUpError } = await signUpWithInvite({
      inviteCode: inviteCode.trim(),
      displayName: displayName.trim(),
      email: email.trim(),
      password,
    })

    if (signUpError) {
      setError(signUpError.message)
      setIsSubmitting(false)
      return
    }

    if (data.session) {
      navigate('/', { replace: true })
      return
    }

    navigate('/login', {
      replace: true,
      state: { message: '계정이 생성되었습니다. 이메일 인증 후 로그인해주세요.' },
    })
  }

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass animate-fade-in" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '420px' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>초대 확인</h1>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '1.5rem' }}>
          초대코드와 이메일로 계정을 생성하고 비밀번호를 설정하세요
        </p>

        <ErrorBanner message={error} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="invite-code" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              초대코드
            </label>
            <input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="INVITE-2026-XXXX"
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
            <label htmlFor="invite-display-name" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              표시 이름
            </label>
            <input
              id="invite-display-name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="홍길동"
              autoComplete="name"
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
            <label htmlFor="invite-email" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              이메일
            </label>
            <input
              id="invite-email"
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
            <label htmlFor="invite-password" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              새 비밀번호
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8자 이상"
              autoComplete="new-password"
              required
              minLength={8}
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
            <label htmlFor="invite-password-confirm" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              비밀번호 확인
            </label>
            <input
              id="invite-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="비밀번호 재입력"
              autoComplete="new-password"
              required
              minLength={8}
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
            {isSubmitting ? '설정 중...' : '설정 및 시작하기'}
          </button>
        </form>

        <p style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          이미 계정이 있나요?{' '}
          <Link to="/login" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
            로그인으로 이동
          </Link>
        </p>
      </div>
    </div>
  )
}

export default SetPassword
