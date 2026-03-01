import { useState } from 'react'
import { usePrayerPage } from '../features/prayer/hooks'
import { canManagePost } from '../features/profile/api'

const EMPTY_FORM = {
  title: '',
  content: '',
}

function formatDate(value) {
  if (!value) {
    return '방금 전'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '방금 전'
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

function PrayerRequestsContent() {
  const {
    supabaseStatus,
    profile,
    requests,
    isLoading,
    error,
    createRequest,
    updateRequest,
    deleteRequest,
    toggleSupport,
    isSubmitting,
  } = usePrayerPage()

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
    setFeedback('')
    setIsFormOpen((prev) => !prev)
  }

  const openEditForm = (request) => {
    setForm({ title: request.title, content: request.content })
    setEditingId(request.id)
    setIsFormOpen(true)
    setFeedback('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      if (editingId) {
        await updateRequest({ requestId: editingId, payload: form })
        setFeedback('기도제목이 수정되었습니다.')
      } else {
        await createRequest(form)
        setFeedback('기도제목이 등록되었습니다.')
      }

      setIsFormOpen(false)
      resetForm()
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }

  const handleDelete = async (requestId) => {
    const shouldDelete = window.confirm('이 기도제목을 삭제하시겠어요?')
    if (!shouldDelete) {
      return
    }

    setFeedback('')
    try {
      await deleteRequest(requestId)
      setFeedback('기도제목이 삭제되었습니다.')
      if (editingId === requestId) {
        resetForm()
      }
    } catch (deleteError) {
      setFeedback(deleteError.message)
    }
  }

  const handleToggleSupport = async (requestId) => {
    setFeedback('')
    try {
      await toggleSupport(requestId)
    } catch (supportError) {
      setFeedback(supportError.message)
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
          <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>기도제목</h1>
          <p style={{ color: 'var(--text-secondary)' }}>서로를 위해 기도하는 중고등부가 되어요.</p>
          {profile ? (
            <p style={{ marginTop: '0.35rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              {profile.displayName} ({profile.role})
            </p>
          ) : null}
        </div>
        <button
          className="btn-primary"
          type="button"
          onClick={openCreateForm}
          disabled={!supabaseStatus.configured || isSubmitting}
        >
          {isFormOpen && !editingId ? '작성 취소' : '기도제목 올리기'}
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
            placeholder="기도제목 제목"
            style={inputStyle}
            required
          />
          <textarea
            value={form.content}
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="구체적인 기도 내용을 적어주세요"
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
            required
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
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
          <p style={{ color: 'var(--text-secondary)' }}>기도제목을 불러오는 중입니다...</p>
        </div>
      ) : null}

      {!isLoading && requests.length === 0 ? (
        <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>등록된 기도제목이 없습니다.</p>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {requests.map((request) => {
          const canManage = canManagePost(profile, request.authorId)

          return (
            <article key={request.id} className="glass" style={{ padding: '1.1rem', borderRadius: 'var(--radius-lg)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 260px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{request.title}</h3>
                  <p style={{ color: 'var(--text-primary)', opacity: 0.92, marginBottom: '0.8rem', whiteSpace: 'pre-wrap' }}>
                    {request.content}
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    작성자: {request.authorName} • {formatDate(request.createdAt)}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => handleToggleSupport(request.id)}
                    disabled={isSubmitting || !supabaseStatus.configured}
                    style={{
                      color: request.prayedByMe ? 'var(--accent-primary)' : undefined,
                      fontWeight: request.prayedByMe ? 700 : 500,
                    }}
                  >
                    🙏 {request.prayedByMe ? '기도중' : '기도할게'} ({request.prayerCount})
                  </button>

                  {canManage ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => openEditForm(request)}
                      disabled={isSubmitting}
                    >
                      수정
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => handleDelete(request.id)}
                      disabled={isSubmitting}
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  padding: '0.7rem 0.8rem',
}

function PrayerRequests() {
  return <PrayerRequestsContent />
}

export default PrayerRequests
