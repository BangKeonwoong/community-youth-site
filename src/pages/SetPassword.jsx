import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ErrorBanner from '../components/common/ErrorBanner'
import { useAuth } from '../hooks/useAuth'

const KR_MOBILE_PATTERN = /^01[016789][0-9]{7,8}$/
const LOGIN_ID_PATTERN = /^[a-z0-9._-]{4,20}$/
const MEMBER_TYPE_OPTIONS = [
  { value: 'pastor', label: '교역자' },
  { value: 'teacher', label: '교사' },
  { value: 'student', label: '학생' },
]

function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function formatDateTime(value, emptyText = '미정') {
  if (!value) {
    return emptyText
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return emptyText
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function SetPassword() {
  const navigate = useNavigate()
  const { getSignUpPolicy, signUpWithInvite } = useAuth()

  const [inviteCode, setInviteCode] = useState('')
  const [loginId, setLoginId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [memberType, setMemberType] = useState('')
  const [gender, setGender] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [policyError, setPolicyError] = useState('')
  const [isPolicyLoading, setIsPolicyLoading] = useState(true)
  const [signupPolicy, setSignupPolicy] = useState({
    noInviteRequiredUntil: null,
    isNoInvitePeriod: false,
    isInviteRequired: false,
    isBootstrapAvailable: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isNoInvitePeriod = Boolean(signupPolicy?.isNoInvitePeriod)

  useEffect(() => {
    let isMounted = true

    const loadSignUpPolicy = async () => {
      setIsPolicyLoading(true)
      setPolicyError('')
      const { data, error: policyLoadError } = await getSignUpPolicy()

      if (!isMounted) {
        return
      }

      if (policyLoadError) {
        setPolicyError(policyLoadError.message || '가입 정책을 불러오지 못했습니다. 다시 시도해 주세요.')
      } else if (data) {
        setSignupPolicy(data)
      }

      setIsPolicyLoading(false)
    }

    loadSignUpPolicy()

    return () => {
      isMounted = false
    }
  }, [getSignUpPolicy])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const normalizedInviteCode = isNoInvitePeriod ? '' : inviteCode.trim()
    const normalizedLoginId = loginId.trim().toLowerCase()
    const normalizedDisplayName = displayName.trim()
    const normalizedBirthDate = birthDate.trim()
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)
    const normalizedMemberType = memberType.trim().toLowerCase()
    const normalizedGender = gender.trim().toLowerCase()

    if (!normalizedLoginId) {
      setError('아이디를 입력해 주세요.')
      return
    }

    if (!LOGIN_ID_PATTERN.test(normalizedLoginId)) {
      setError('아이디는 영문 소문자/숫자/._- 조합 4~20자로 입력해 주세요.')
      return
    }

    if (!normalizedDisplayName) {
      setError('이름을 입력해 주세요.')
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

    if (!['pastor', 'teacher', 'student'].includes(normalizedMemberType)) {
      setError('구분을 선택해 주세요.')
      return
    }

    if (!isNoInvitePeriod && signupPolicy?.isInviteRequired && !normalizedInviteCode) {
      setError('현재는 초대코드가 필요한 기간입니다. 초대코드를 입력해 주세요.')
      return
    }

    if (!(normalizedGender === 'male' || normalizedGender === 'female')) {
      setError('성별을 선택해 주세요.')
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
      loginId: normalizedLoginId,
      displayName: normalizedDisplayName,
      birthDate: normalizedBirthDate,
      phoneNumber: normalizedPhoneNumber,
      memberType: normalizedMemberType,
      gender: normalizedGender,
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
      state: { message: '가입이 완료되었습니다. 아이디와 비밀번호로 로그인해 주세요.' },
    })
  }

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass animate-fade-in" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '420px' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>회원가입</h1>
        {isPolicyLoading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.75rem' }}>
            가입 정책을 확인하는 중입니다...
          </p>
        ) : isNoInvitePeriod ? (
          <p style={{ color: '#166534', textAlign: 'center', marginBottom: '0.75rem' }}>
            현재 {formatDateTime(signupPolicy.noInviteRequiredUntil, '종료 시각 미정')}까지 초대코드 없이 가입할 수 있습니다.
          </p>
        ) : signupPolicy?.isBootstrapAvailable ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.75rem' }}>
            첫 관리자 계정은 초대코드 없이 가입할 수 있습니다.
          </p>
        ) : (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.75rem' }}>
            초대코드와 기본 정보를 입력해 계정을 만드세요
          </p>
        )}
        {policyError ? (
          <p style={{ color: '#b45309', textAlign: 'center', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
            {policyError}
          </p>
        ) : (
          <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
            면제 기간 중에는 초대코드 입력이 비활성화됩니다.
          </p>
        )}

        <ErrorBanner message={error} />

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="invite-code" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              초대코드{isNoInvitePeriod ? ' (면제 기간 중 비활성화)' : ''}
            </label>
            <input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder={isNoInvitePeriod ? '현재는 초대코드 없이 가입됩니다.' : 'INVITE-2026-XXXX'}
              disabled={isNoInvitePeriod}
              className="form-control"
            />
          </div>

          <div>
            <label htmlFor="invite-login-id" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              아이디
            </label>
            <input
              id="invite-login-id"
              type="text"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="example.id"
              autoComplete="username"
              className="form-control"
            />
          </div>

          <div>
            <label htmlFor="invite-display-name" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              이름
            </label>
            <input
              id="invite-display-name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="홍길동"
              autoComplete="name"
              className="form-control"
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
              className="form-control"
            />
          </div>

          <div>
            <label htmlFor="invite-phone-number" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              전화번호
            </label>
            <input
              id="invite-phone-number"
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="010-1234-5678"
              autoComplete="tel"
              className="form-control"
            />
          </div>

          <div>
            <label htmlFor="invite-member-type" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              구분
            </label>
            <select
              id="invite-member-type"
              value={memberType}
              onChange={(event) => setMemberType(event.target.value)}
              className="form-control"
            >
              <option value="">선택해 주세요</option>
              {MEMBER_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="invite-gender" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              성별
            </label>
            <select
              id="invite-gender"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              className="form-control"
            >
              <option value="">선택해 주세요</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
            </select>
          </div>

          <div>
            <label htmlFor="invite-password" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              암호
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8자 이상"
              autoComplete="new-password"
              minLength={8}
              className="form-control"
            />
          </div>

          <div>
            <label htmlFor="invite-password-confirm" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              암호 확인
            </label>
            <input
              id="invite-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="암호 재입력"
              autoComplete="new-password"
              minLength={8}
              className="form-control"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '0.5rem', width: '100%', opacity: isSubmitting ? 0.8 : 1 }}>
            {isSubmitting ? '가입 중...' : '가입하기'}
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
