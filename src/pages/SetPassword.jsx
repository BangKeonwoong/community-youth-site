import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ErrorBanner from '../components/common/ErrorBanner'
import { useAuth } from '../hooks/useAuth'

const KR_MOBILE_PATTERN = /^01[016789][0-9]{7,8}$/

function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function SetPassword() {
  const navigate = useNavigate()
  const { signUpWithInvite } = useAuth()

  const [inviteCode, setInviteCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const normalizedDisplayName = displayName.trim()
    const normalizedBirthDate = birthDate.trim()
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)
    const normalizedGender = gender.trim().toLowerCase()
    const normalizedEmail = email.trim()
    const normalizedInviteCode = inviteCode.trim()

    if (!normalizedDisplayName) {
      setError('표시 이름을 입력해 주세요.')
      return
    }

    if (!normalizedBirthDate) {
      setError('생년월일을 입력해 주세요.')
      return
    }

    if (!normalizedPhoneNumber) {
      setError('휴대폰 번호를 입력해 주세요.')
      return
    }

    if (!KR_MOBILE_PATTERN.test(normalizedPhoneNumber)) {
      setError('휴대폰 번호 형식이 올바르지 않습니다. (예: 01012345678)')
      return
    }

    if (!(normalizedGender === 'male' || normalizedGender === 'female')) {
      setError('성별을 선택해 주세요.')
      return
    }

    if (!normalizedEmail) {
      setError('이메일을 입력해 주세요.')
      return
    }

    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setError('올바른 이메일 형식으로 입력해 주세요.')
      return
    }

    if (!password) {
      setError('비밀번호를 입력해 주세요.')
      return
    }

    if (!confirmPassword) {
      setError('비밀번호 확인을 입력해 주세요.')
      return
    }

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
      inviteCode: normalizedInviteCode,
      displayName: normalizedDisplayName,
      birthDate: normalizedBirthDate,
      phoneNumber: normalizedPhoneNumber,
      gender: normalizedGender,
      email: normalizedEmail,
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
          초대코드(첫 관리자라면 비워도 됨)와 이메일로 계정을 생성하고 비밀번호를 설정하세요
        </p>

        <ErrorBanner message={error} />

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="invite-code" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              초대코드
            </label>
            <input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="INVITE-2026-XXXX (선택)"
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
            <label htmlFor="invite-birth-date" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              생년월일
            </label>
            <input
              id="invite-birth-date"
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              max={new Date().toISOString().slice(0, 10)}
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
            <label htmlFor="invite-phone-number" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              휴대폰 번호
            </label>
            <input
              id="invite-phone-number"
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="010-1234-5678"
              autoComplete="tel"
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
            <label htmlFor="invite-gender" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              성별
            </label>
            <select
              id="invite-gender"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">선택해 주세요</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
            </select>
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
