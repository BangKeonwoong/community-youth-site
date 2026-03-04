import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Smartphone, Volume2, Calendar, Users, MessageCircle, MessageSquare, Cake, Gift } from 'lucide-react'
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
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            새 글/메시지/채팅 알림 수신 범위를 개인별로 설정할 수 있습니다.
          </p>

          <ErrorBanner message={notificationSettingsQuery.error?.message || ''} />
          <ErrorBanner message={notificationFeedback} />

          <form onSubmit={handleSubmitNotificationSettings} className="settings-group">

            {/* 시스템 알림 컴포넌트 */}
            <div>
              <h3 className="settings-section-title">시스템 및 기기 알림</h3>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Smartphone size={16} className="text-secondary" />
                    <span className="settings-item-title">인앱 알림</span>
                  </div>
                  <span className="settings-item-desc">앱 화면 내 상단 알림 배너 표시</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.inAppEnabled}
                    onChange={(event) => handleToggleNotificationSetting('inAppEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Bell size={16} className="text-secondary" />
                    <span className="settings-item-title">브라우저 푸시 알림</span>
                  </div>
                  <span className="settings-item-desc">기기별 브라우저 푸시 메시지 수신 (권한 필요)</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.browserEnabled}
                    onChange={(event) => handleToggleNotificationSetting('browserEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Volume2 size={16} className="text-secondary" />
                    <span className="settings-item-title">알림 소리</span>
                  </div>
                  <span className="settings-item-desc">알림 발생 시 소리 재생</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.soundEnabled}
                    onChange={(event) => handleToggleNotificationSetting('soundEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            {/* 서비스 알림 컴포넌트 */}
            <div style={{ marginTop: '0.5rem' }}>
              <h3 className="settings-section-title">서비스 수신 항목</h3>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Calendar size={16} className="text-secondary" />
                    <span className="settings-item-title">행사 일정 알림</span>
                  </div>
                  <span className="settings-item-desc">새로운 공식 행사 등록 시 안내</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.scheduleEnabled}
                    onChange={(event) => handleToggleNotificationSetting('scheduleEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={16} className="text-secondary" />
                    <span className="settings-item-title">벙개 일정 알림</span>
                  </div>
                  <span className="settings-item-desc">새로운 벙개 모임 생성 시 안내</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.meetupEnabled}
                    onChange={(event) => handleToggleNotificationSetting('meetupEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MessageCircle size={16} className="text-secondary" />
                    <span className="settings-item-title">채팅 알림</span>
                  </div>
                  <span className="settings-item-desc">참여 중인 채팅방의 새 메시지 수신</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.chatEnabled}
                    onChange={(event) => handleToggleNotificationSetting('chatEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MessageSquare size={16} className="text-secondary" />
                    <span className="settings-item-title">1:1 메시지 알림</span>
                  </div>
                  <span className="settings-item-desc">개인 다이렉트 메시지 수신</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.messageEnabled}
                    onChange={(event) => handleToggleNotificationSetting('messageEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Gift size={16} className="text-secondary" />
                    <span className="settings-item-title">내 생일 축하 메시지 알림</span>
                  </div>
                  <span className="settings-item-desc">내 생일 롤링페이퍼에 새 메시지가 달렸을 때</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.birthdayMessageEnabled}
                    onChange={(event) => handleToggleNotificationSetting('birthdayMessageEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Cake size={16} className="text-secondary" />
                    <span className="settings-item-title">오늘의 생일자 알림</span>
                  </div>
                  <span className="settings-item-desc">생일을 맞은 다른 멤버 안내 (아침 9시)</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolvedNotificationSettings.birthdayDailyEnabled}
                    onChange={(event) => handleToggleNotificationSetting('birthdayDailyEnabled', event.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
              <button type="submit" className="btn-primary" disabled={updateNotificationMutation.isPending}>
                {updateNotificationMutation.isPending ? '저장 중...' : '변경 사항 저장'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

export default ProfileComplete
