import { useState } from 'react'
import PostComments from '../components/comments/PostComments'
import { useMeetupsPage } from '../features/meetups/hooks'
import { canManagePost } from '../features/profile/api'

const EMPTY_FORM = {
  title: '',
  description: '',
  location: '',
  eventAt: '',
  capacity: 4,
}

function formatDateTime(value) {
  if (!value) {
    return '일정 미정'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '일정 미정'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(date)
}

function InfoBanner({ message }) {
  return (
    <div
      className="glass"
      style={{
        marginBottom: '1.25rem',
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

function MeetupsContent() {
  const {
    supabaseStatus,
    profile,
    meetups,
    isLoading,
    error,
    createMeetup,
    updateMeetup,
    deleteMeetup,
    toggleParticipation,
    isSubmitting,
  } = useMeetupsPage()

  const [form, setForm] = useState(EMPTY_FORM)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [feedback, setFeedback] = useState('')

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const openCreateForm = () => {
    resetForm()
    setIsFormOpen((prev) => !prev)
    setFeedback('')
  }

  const openEditForm = (meetup) => {
    setForm({
      title: meetup.title,
      description: meetup.description,
      location: meetup.location,
      eventAt: meetup.eventAt ? meetup.eventAt.slice(0, 16) : '',
      capacity: meetup.capacity || 0,
    })
    setEditingId(meetup.id)
    setIsFormOpen(true)
    setFeedback('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      if (editingId) {
        await updateMeetup({ meetupId: editingId, payload: form })
        setFeedback('모임 글이 수정되었습니다.')
      } else {
        await createMeetup(form)
        setFeedback('새 모임이 등록되었습니다.')
      }

      resetForm()
      setIsFormOpen(false)
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }

  const handleDelete = async (meetupId) => {
    const shouldDelete = window.confirm('이 모임을 삭제하시겠어요?')
    if (!shouldDelete) {
      return
    }

    setFeedback('')
    try {
      await deleteMeetup(meetupId)
      setFeedback('모임 글이 삭제되었습니다.')
      if (editingId === meetupId) {
        resetForm()
      }
    } catch (deleteError) {
      setFeedback(deleteError.message)
    }
  }

  const handleToggleParticipation = async (meetupId) => {
    setFeedback('')
    try {
      await toggleParticipation(meetupId)
    } catch (toggleError) {
      setFeedback(toggleError.message)
    }
  }

  return (
    <div className="animate-fade-in">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>벙개 / 모임</h1>
          <p style={{ color: 'var(--text-secondary)' }}>함께 밥먹고, 놀고, 교제해요!</p>
          {profile ? (
            <p style={{ marginTop: '0.35rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              {profile.displayName} ({profile.role})
            </p>
          ) : null}
        </div>
        <button
          className="btn-primary"
          onClick={openCreateForm}
          type="button"
          disabled={!supabaseStatus.configured || isSubmitting}
        >
          {isFormOpen && !editingId ? '작성 취소' : '벙개 만들기'}
        </button>
      </div>

      {!supabaseStatus.configured ? <InfoBanner message={supabaseStatus.message} /> : null}

      {feedback ? (
        <div
          className="glass"
          style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}
        >
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{feedback}</p>
        </div>
      ) : null}

      {error ? (
        <div
          className="glass"
          style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}
        >
          <p style={{ color: '#ef4444', fontSize: '0.9rem' }}>{error.message}</p>
        </div>
      ) : null}

      {isFormOpen ? (
        <form
          onSubmit={handleSubmit}
          className="glass"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="모임 제목"
            className="form-control"
            required
          />
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="모임 소개"
            rows={3}
            className="form-control"
            required
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <input
              type="datetime-local"
              value={form.eventAt}
              onChange={(event) => setForm((prev) => ({ ...prev, eventAt: event.target.value }))}
              className="form-control"
            />
            <input
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="장소"
              className="form-control"
            />
            <input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
              placeholder="정원"
              className="form-control"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => {
                setIsFormOpen(false)
                resetForm()
              }}
            >
              취소
            </button>
            <button className="btn-primary" type="submit" disabled={isSubmitting}>
              {editingId ? '수정 저장' : '등록'}
            </button>
          </div>
        </form>
      ) : null}

      {isLoading ? (
        <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>모임을 불러오는 중입니다...</p>
        </div>
      ) : null}

      {!isLoading && meetups.length === 0 ? (
        <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>등록된 모임이 없습니다.</p>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {meetups.map((meetup) => {
          const canManage = canManagePost(profile, meetup.authorId)

          return (
            <div
              key={meetup.id}
              className="glass"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                display: 'grid',
                gap: '0.9rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 280px' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.35rem' }}>{meetup.title}</h3>
                  <p style={{ color: 'var(--text-primary)', opacity: 0.9, marginBottom: '0.35rem' }}>
                    {meetup.description}
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    {formatDateTime(meetup.eventAt)} • {meetup.location || '장소 미정'}
                  </p>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                    작성자: {meetup.authorName}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      backgroundColor: 'var(--accent-light)',
                      color: 'var(--accent-primary)',
                      padding: '0.35rem 0.7rem',
                      borderRadius: '999px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    {meetup.participantCount} / {meetup.capacity || '∞'} 명
                  </span>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => handleToggleParticipation(meetup.id)}
                    disabled={isSubmitting || !supabaseStatus.configured}
                  >
                    {meetup.isParticipating ? '참여 취소' : '참여하기'}
                  </button>

                  {canManage ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => openEditForm(meetup)}
                      disabled={isSubmitting}
                    >
                      수정
                    </button>
                  ) : null}

                  {canManage ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => handleDelete(meetup.id)}
                      disabled={isSubmitting}
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
              </div>

              <PostComments postType="meetup" postId={meetup.id} />
            </div>
          )
        })}
      </div>
    </div>
  )
}



function Meetups() {
  return <MeetupsContent />
}

export default Meetups
