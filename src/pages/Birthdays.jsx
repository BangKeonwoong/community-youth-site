import { useMemo, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import ErrorBanner from '../components/common/ErrorBanner'
import { useBirthdaysPage } from '../features/birthdays/hooks'

const UPCOMING_DAYS = 7

function formatBirthDate(value) {
  if (!value) {
    return '생일 정보 없음'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '생일 정보 없음'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatDaysBadge(daysUntil) {
  if (daysUntil === 0) {
    return '오늘'
  }

  return `D-${daysUntil}`
}

function InfoBanner({ message }) {
  return (
    <div
      className="glass"
      style={{
        marginBottom: '1rem',
        padding: '1rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid #f59e0b',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Supabase 연결 필요</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</p>
    </div>
  )
}

function Birthdays() {
  const { supabaseStatus, profile, birthdays, isLoading, error, sendBirthdayMessage, isSubmitting } = useBirthdaysPage(
    UPCOMING_DAYS,
  )
  const [selectedProfileId, setSelectedProfileId] = useState(null)
  const [content, setContent] = useState('')
  const [feedback, setFeedback] = useState('')
  const validProfileIds = birthdays.map((birthday) => birthday.profileId).filter(Boolean)
  const effectiveSelectedProfileId =
    selectedProfileId && validProfileIds.includes(selectedProfileId)
      ? selectedProfileId
      : validProfileIds[0] || null

  const selectedPerson = useMemo(
    () => birthdays.find((birthday) => birthday.profileId === effectiveSelectedProfileId) || null,
    [birthdays, effectiveSelectedProfileId],
  )

  const handleSelectPerson = (birthday) => {
    setSelectedProfileId(birthday.profileId)

    if (!content.trim()) {
      setContent(`${birthday.displayName}님 생일 축하해요!`)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      await sendBirthdayMessage({ receiverId: effectiveSelectedProfileId, content })
      setFeedback('생일 메시지를 전송했습니다.')
      setContent('')
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }

  return (
    <div className="animate-fade-in page-stack birthdays-page">
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.35rem' }}>생일</h1>
        <p style={{ color: 'var(--text-secondary)' }}>오늘부터 {UPCOMING_DAYS}일 안에 있는 생일을 확인하고 축하 메시지를 보내세요.</p>
        {profile ? (
          <p style={{ marginTop: '0.35rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            {profile.displayName} ({profile.role})
          </p>
        ) : null}
      </header>

      {!supabaseStatus.configured ? <InfoBanner message={supabaseStatus.message} /> : null}

      <ErrorBanner message={error?.message || ''} />
      <ErrorBanner message={feedback} />

      <section className="glass birthdays-card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.8rem' }}>오늘 + 다가오는 생일</h2>

        {isLoading ? (
          <p style={{ color: 'var(--text-secondary)' }}>생일 목록을 불러오는 중입니다...</p>
        ) : birthdays.length === 0 ? (
          <EmptyState
            title="다가오는 생일이 없습니다."
            description="생일이 등록된 프로필이 있으면 여기에 표시됩니다."
          />
        ) : (
          <div className="birthday-list">
            {birthdays.map((birthday) => {
              const isSelected = effectiveSelectedProfileId === birthday.profileId
              const badgeLabel = formatDaysBadge(birthday.daysUntil)

              return (
                <button
                  key={`${birthday.profileId}-${birthday.birthDate || 'unknown'}`}
                  type="button"
                  className={`birthday-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectPerson(birthday)}
                >
                  <div>
                    <p style={{ fontWeight: 600 }}>{birthday.displayName}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      생일: {formatBirthDate(birthday.birthDate)}
                    </p>
                  </div>
                  <span className={`birthday-days-badge ${birthday.daysUntil === 0 ? 'today' : ''}`}>
                    {badgeLabel}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="glass birthdays-card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.8rem' }}>축하 메시지 보내기</h2>

        {!selectedPerson ? (
          <p style={{ color: 'var(--text-secondary)' }}>메시지를 보낼 대상을 선택해 주세요.</p>
        ) : (
          <form className="birthday-message-form" onSubmit={handleSubmit}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              받는 사람: <strong style={{ color: 'var(--text-primary)' }}>{selectedPerson.displayName}</strong>
            </p>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="축하 메시지를 입력해 주세요"
              rows={4}
              required
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!supabaseStatus.configured || isSubmitting || !effectiveSelectedProfileId}
                >
                {isSubmitting ? '전송 중...' : '메시지 보내기'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

export default Birthdays
