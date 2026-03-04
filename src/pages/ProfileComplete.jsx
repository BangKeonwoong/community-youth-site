import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import ErrorBanner from '../components/common/ErrorBanner'
import LoadingState from '../components/common/LoadingState'
import { getCurrentProfile, updateCurrentProfileDetails } from '../features/profile/api'
import {
  getDefaultNotificationSettings,
  getNotificationSettings,
  updateNotificationSettings,
} from '../features/notifications/api'

const PROFILE_QUERY_KEY = ['profile']
const NOTIFICATION_SETTINGS_QUERY_KEY = ['notification-settings']

const EMPTY_FORM = {
  displayName: null,
  birthDate: null,
  phoneNumber: null,
  memberType: null,
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
  const [notificationForm, setNotificationForm] = useState(null)
  const [notificationFeedback, setNotificationFeedback] = useState('')

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })
  const profileId = profileQuery.data?.id || null

  const notificationSettingsQuery = useQuery({
    queryKey: [...NOTIFICATION_SETTINGS_QUERY_KEY, profileId || 'anonymous'],
    queryFn: () => getNotificationSettings(profileId),
    enabled: Boolean(profileId),
    staleTime: 30 * 1000,
  })

  const resolvedForm = useMemo(
    () => ({
      displayName: form.displayName ?? profileQuery.data?.displayName ?? '',
      birthDate: form.birthDate ?? toDateInputValue(profileQuery.data?.birthDate),
      phoneNumber: form.phoneNumber ?? profileQuery.data?.phoneNumber ?? '',
      memberType: form.memberType ?? profileQuery.data?.memberType ?? '',
      gender: form.gender ?? profileQuery.data?.gender ?? '',
    }),
    [form, profileQuery.data],
  )
  const resolvedNotificationSettings = useMemo(
    () => notificationForm ?? notificationSettingsQuery.data ?? getDefaultNotificationSettings(),
    [notificationForm, notificationSettingsQuery.data],
  )

  const updateMutation = useMutation({
    mutationFn: updateCurrentProfileDetails,
    onSuccess: async (updatedProfile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, updatedProfile)
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
      navigate('/', { replace: true })
    },
  })
  const updateNotificationMutation = useMutation({
    mutationFn: (payload) => updateNotificationSettings(profileId, payload),
    onSuccess: async (updatedSettings) => {
      setNotificationForm(updatedSettings)
      await queryClient.invalidateQueries({ queryKey: NOTIFICATION_SETTINGS_QUERY_KEY })
      setNotificationFeedback('알림 설정을 저장했습니다.')
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
        memberType: resolvedForm.memberType,
        gender: resolvedForm.gender,
      })
    } catch (error) {
      setFeedback(error.message)
    }
  }

  const handleToggleNotificationSetting = async (key, value) => {
    if (
      key === 'browserEnabled' &&
      value === true &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'default'
    ) {
      const permission = await window.Notification.requestPermission()
      if (permission === 'denied') {
        setNotificationFeedback('브라우저 알림이 차단되어 있어 시스템 알림을 사용할 수 없습니다.')
      }
    }

    setNotificationFeedback('')
    setNotificationForm((prev) => ({
      ...(prev || resolvedNotificationSettings),
      [key]: value,
    }))
  }

  const handleSubmitNotificationSettings = async (event) => {
    event.preventDefault()
    setNotificationFeedback('')

    try {
      await updateNotificationMutation.mutateAsync(resolvedNotificationSettings)
    } catch (error) {
      setNotificationFeedback(error.message)
    }
  }

  return (
    <div className="animate-fade-in profile-complete-page">
      <section
        style={{
          width: '100%',
          maxWidth: '760px',
          display: 'grid',
          gap: '1rem',
        }}
      >
        <div className="glass profile-complete-card">
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
                className="form-control"
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
                className="form-control"
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
                className="form-control"
                required
              />
            </div>

            <div className="profile-form-field">
              <label htmlFor="profile-member-type">구분</label>
              <select
                id="profile-member-type"
                value={resolvedForm.memberType}
                onChange={(event) => setForm((prev) => ({ ...prev, memberType: event.target.value }))}
                className="form-control"
                required
              >
                <option value="">선택</option>
                <option value="pastor">교역자</option>
                <option value="teacher">교사</option>
                <option value="student">학생</option>
              </select>
            </div>

            <div className="profile-form-field">
              <label htmlFor="profile-gender">성별</label>
              <select
                id="profile-gender"
                value={resolvedForm.gender}
                onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
                className="form-control"
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
        </div>

        <div className="glass profile-complete-card">
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.35rem' }}>알림 설정</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            새 글/메시지/채팅 알림 수신 범위를 개인별로 설정할 수 있습니다.
          </p>

          <ErrorBanner message={notificationSettingsQuery.error?.message || ''} />
          <ErrorBanner message={notificationFeedback} />

          <form onSubmit={handleSubmitNotificationSettings} style={{ display: 'grid', gap: '0.85rem' }}>
            <div className="profile-form-grid">
              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.inAppEnabled}
                  onChange={(event) => handleToggleNotificationSetting('inAppEnabled', event.target.checked)}
                />
                <span>인앱 알림</span>
              </label>

              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.browserEnabled}
                  onChange={(event) => handleToggleNotificationSetting('browserEnabled', event.target.checked)}
                />
                <span>브라우저 알림</span>
              </label>

              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.soundEnabled}
                  onChange={(event) => handleToggleNotificationSetting('soundEnabled', event.target.checked)}
                />
                <span>알림 소리</span>
              </label>

              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.scheduleEnabled}
                  onChange={(event) => handleToggleNotificationSetting('scheduleEnabled', event.target.checked)}
                />
                <span>행사 일정 알림</span>
              </label>

              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.meetupEnabled}
                  onChange={(event) => handleToggleNotificationSetting('meetupEnabled', event.target.checked)}
                />
                <span>벙개 일정 알림</span>
              </label>

              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.chatEnabled}
                  onChange={(event) => handleToggleNotificationSetting('chatEnabled', event.target.checked)}
                />
                <span>채팅 알림</span>
              </label>

              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.messageEnabled}
                  onChange={(event) => handleToggleNotificationSetting('messageEnabled', event.target.checked)}
                />
                <span>메시지 알림</span>
              </label>

              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.birthdayMessageEnabled}
                  onChange={(event) => handleToggleNotificationSetting('birthdayMessageEnabled', event.target.checked)}
                />
                <span>생일 메시지 알림</span>
              </label>

              <label className="profile-form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={resolvedNotificationSettings.birthdayDailyEnabled}
                  onChange={(event) => handleToggleNotificationSetting('birthdayDailyEnabled', event.target.checked)}
                />
                <span>오늘 생일 알림</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary" disabled={updateNotificationMutation.isPending}>
                {updateNotificationMutation.isPending ? '저장 중...' : '알림 설정 저장'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

export default ProfileComplete
