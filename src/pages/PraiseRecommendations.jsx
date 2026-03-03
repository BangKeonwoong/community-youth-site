import { useState } from 'react'
import PostComments from '../components/comments/PostComments'
import { usePraisePage } from '../features/praise/hooks'
import { canManagePost } from '../features/profile/api'

const EMPTY_FORM = {
  title: '',
  artist: '',
  youtubeUrl: '',
  note: '',
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
    month: 'short',
    day: 'numeric',
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

function PraiseRecommendationsContent() {
  const {
    supabaseStatus,
    profile,
    recommendations,
    isLoading,
    error,
    createRecommendation,
    updateRecommendation,
    deleteRecommendation,
    toggleLike,
    isSubmitting,
  } = usePraisePage()

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

  const openEditForm = (recommendation) => {
    setForm({
      title: recommendation.title,
      artist: recommendation.artist,
      youtubeUrl: recommendation.youtubeUrl,
      note: recommendation.note,
    })
    setEditingId(recommendation.id)
    setIsFormOpen(true)
    setFeedback('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      if (editingId) {
        await updateRecommendation({ recommendationId: editingId, payload: form })
        setFeedback('찬양 추천이 수정되었습니다.')
      } else {
        await createRecommendation(form)
        setFeedback('새 찬양 추천이 등록되었습니다.')
      }

      setIsFormOpen(false)
      resetForm()
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }

  const handleDelete = async (recommendationId) => {
    const shouldDelete = window.confirm('이 찬양 추천을 삭제하시겠어요?')
    if (!shouldDelete) {
      return
    }

    setFeedback('')
    try {
      await deleteRecommendation(recommendationId)
      setFeedback('찬양 추천이 삭제되었습니다.')
      if (editingId === recommendationId) {
        resetForm()
      }
    } catch (deleteError) {
      setFeedback(deleteError.message)
    }
  }

  const handleToggleLike = async (recommendationId) => {
    setFeedback('')
    try {
      await toggleLike(recommendationId)
    } catch (likeError) {
      setFeedback(likeError.message)
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
          <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>찬양 추천</h1>
          <p style={{ color: 'var(--text-secondary)' }}>마음을 울리는 찬양을 함께 들어요.</p>
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
          {isFormOpen && !editingId ? '작성 취소' : '찬양 추천하기'}
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
            placeholder="찬양 제목"
            className="form-control"
            required
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <input
              value={form.artist}
              onChange={(event) => setForm((prev) => ({ ...prev, artist: event.target.value }))}
              placeholder="아티스트"
              className="form-control"
            />
            <input
              type="url"
              value={form.youtubeUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, youtubeUrl: event.target.value }))}
              placeholder="YouTube 링크 (선택)"
              className="form-control"
            />
          </div>
          <textarea
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="추천 이유"
            rows={3}
            className="form-control"
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
          <p style={{ color: 'var(--text-secondary)' }}>찬양 추천을 불러오는 중입니다...</p>
        </div>
      ) : null}

      {!isLoading && recommendations.length === 0 ? (
        <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>등록된 찬양 추천이 없습니다.</p>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {recommendations.map((recommendation) => {
          const canManage = canManagePost(profile, recommendation.authorId)

          return (
            <article
              key={recommendation.id}
              className="glass"
              style={{ overflow: 'hidden', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column' }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: '16 / 9',
                  backgroundColor: 'var(--bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {recommendation.thumbnailUrl ? (
                  <img
                    src={recommendation.thumbnailUrl}
                    alt={`${recommendation.title} 썸네일`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Thumbnail</span>
                )}
              </div>

              <div style={{ padding: '1rem', display: 'grid', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{recommendation.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {recommendation.artist || '아티스트 미정'} • {recommendation.authorName}
                </p>
                <p style={{ color: 'var(--text-primary)', opacity: 0.9, whiteSpace: 'pre-wrap', fontSize: '0.92rem' }}>
                  {recommendation.note || '추천 코멘트가 없습니다.'}
                </p>

                {recommendation.youtubeUrl ? (
                  <a
                    href={recommendation.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    유튜브로 듣기
                  </a>
                ) : null}

                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                  등록일: {formatDate(recommendation.createdAt)}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleLike(recommendation.id)}
                    disabled={isSubmitting || !supabaseStatus.configured}
                    style={{
                      color: recommendation.likedByMe ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    {recommendation.likedByMe ? '💜' : '🤍'} 좋아요 {recommendation.likeCount}
                  </button>

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {canManage ? (
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => openEditForm(recommendation)}
                        disabled={isSubmitting}
                      >
                        수정
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => handleDelete(recommendation.id)}
                        disabled={isSubmitting}
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
                </div>

                <PostComments postType="praise" postId={recommendation.id} />
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}



function PraiseRecommendations() {
  return <PraiseRecommendationsContent />
}

export default PraiseRecommendations
