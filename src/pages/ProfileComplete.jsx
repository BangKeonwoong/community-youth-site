import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import ErrorBanner from '../components/common/ErrorBanner'
import LoadingState from '../components/common/LoadingState'
import { getCurrentProfile, updateCurrentProfileDetails } from '../features/profile/api'

const PROFILE_QUERY_KEY = ['profile']

const EMPTY_FORM = {
  displayName: null,
  birthDate: null,
  phoneNumber: null,
  gender: null,
}

function toDateInputValue(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString().slice(0, 10)
}

function ProfileComplete() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [feedback, setFeedback] = useState('')

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const resolvedForm = useMemo(
    () => ({
      displayName: form.displayName ?? profileQuery.data?.displayName ?? '',
      birthDate: form.birthDate ?? toDateInputValue(profileQuery.data?.birthDate),
      phoneNumber: form.phoneNumber ?? profileQuery.data?.phoneNumber ?? '',
      gender: form.gender ?? profileQuery.data?.gender ?? '',
    }),
    [form, profileQuery.data],
  )

  const updateMutation = useMutation({
    mutationFn: updateCurrentProfileDetails,
    onSuccess: async (updatedProfile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, updatedProfile)
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
      navigate('/', { replace: true })
    },
  })

  if (profileQuery.isLoading) {
    return <LoadingState title="프로필 정보 불러오는 중..." description="입력값을 준비하고 있습니다." />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      await updateMutation.mutateAsync({
        displayName: resolvedForm.displayName,
        birthDate: resolvedForm.birthDate,
        phoneNumber: resolvedForm.phoneNumber,
        gender: resolvedForm.gender,
      })
    } catch (error) {
      setFeedback(error.message)
    }
  }

  return (
    <div className="animate-fade-in profile-complete-page">
      <section className="glass profile-complete-card">
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.35rem' }}>프로필 정보 입력</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          커뮤니티 이용을 위해 기본 프로필 정보를 먼저 입력해 주세요.
        </p>

        <ErrorBanner message={profileQuery.error?.message || ''} />
        <ErrorBanner message={feedback} />

        <form onSubmit={handleSubmit} className="profile-form-grid">
          <div className="profile-form-field">
            <label htmlFor="profile-display-name">이름</label>
            <input
              id="profile-display-name"
              value={resolvedForm.displayName}
              onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
              placeholder="예: 홍길동"
              required
            />
          </div>

          <div className="profile-form-field">
            <label htmlFor="profile-birth-date">생년월일</label>
            <input
              id="profile-birth-date"
              type="date"
              value={resolvedForm.birthDate}
              onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
              required
            />
          </div>

          <div className="profile-form-field">
            <label htmlFor="profile-phone-number">연락처</label>
            <input
              id="profile-phone-number"
              type="tel"
              value={resolvedForm.phoneNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
              placeholder="010-0000-0000"
              required
            />
          </div>

          <div className="profile-form-field">
            <label htmlFor="profile-gender">성별</label>
            <select
              id="profile-gender"
              value={resolvedForm.gender}
              onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
              required
            >
              <option value="">선택</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? '저장 중...' : '저장하고 시작하기'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default ProfileComplete
