import { useState } from 'react'
import { useGracePage } from '../features/grace/hooks'
import { canManagePost } from '../features/profile/api'

const EMPTY_FORM = {
  title: '',
  content: '',
}

function formatRelativeDate(value) {
  if (!value) {
    return '방금 전'
  }

  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()

  if (Number.isNaN(diffMs) || diffMs < 0) {
    return '방금 전'
  }

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}분 전`
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}시간 전`
  }

  return `${Math.floor(diffMs / day)}일 전`
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

function GraceSharingContent() {
  const {
    supabaseStatus,
    profile,
    posts,
    isLoading,
    error,
    createPost,
    updatePost,
    deletePost,
    toggleLike,
    isSubmitting,
  } = useGracePage()

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

  const openEditForm = (post) => {
    setForm({ title: post.title, content: post.content })
    setEditingId(post.id)
    setIsFormOpen(true)
    setFeedback('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      if (editingId) {
        await updatePost({ postId: editingId, payload: form })
        setFeedback('글이 수정되었습니다.')
      } else {
        await createPost(form)
        setFeedback('은혜 나눔이 등록되었습니다.')
      }

      setIsFormOpen(false)
      resetForm()
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }

  const handleDelete = async (postId) => {
    const shouldDelete = window.confirm('이 글을 삭제하시겠어요?')
    if (!shouldDelete) {
      return
    }

    setFeedback('')
    try {
      await deletePost(postId)
      setFeedback('글이 삭제되었습니다.')
      if (editingId === postId) {
        resetForm()
      }
    } catch (deleteError) {
      setFeedback(deleteError.message)
    }
  }

  const handleToggleLike = async (postId) => {
    setFeedback('')
    try {
      await toggleLike(postId)
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
          <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>은혜 나눔</h1>
          <p style={{ color: 'var(--text-secondary)' }}>말씀과 삶을 통해 받은 은혜를 나눠요.</p>
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
          {isFormOpen && !editingId ? '작성 취소' : '글쓰기'}
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
            placeholder="제목"
            style={inputStyle}
            required
          />
          <textarea
            value={form.content}
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="은혜를 자유롭게 나눠주세요"
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
          <p style={{ color: 'var(--text-secondary)' }}>게시글을 불러오는 중입니다...</p>
        </div>
      ) : null}

      {!isLoading && posts.length === 0 ? (
        <div className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--text-secondary)' }}>등록된 은혜 나눔이 없습니다.</p>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {posts.map((post) => {
          const canManage = canManagePost(profile, post.authorId)
          const initial = post.authorName ? post.authorName.charAt(0) : '익'

          return (
            <article key={post.id} className="glass" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div
                  style={{
                    width: '2.25rem',
                    height: '2.25rem',
                    borderRadius: '999px',
                    backgroundColor: 'var(--accent-light)',
                    color: 'var(--accent-primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                  }}
                >
                  {initial}
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{post.authorName}</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {formatRelativeDate(post.createdAt)}
                  </p>
                </div>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{post.title}</h3>
              <p style={{ color: 'var(--text-primary)', opacity: 0.9, whiteSpace: 'pre-wrap' }}>{post.content}</p>

              <div
                style={{
                  marginTop: '1rem',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleToggleLike(post.id)}
                  disabled={isSubmitting || !supabaseStatus.configured}
                  style={{
                    color: post.likedByMe ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  {post.likedByMe ? '💜' : '🤍'} 좋아요 {post.likeCount}
                </button>

                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {canManage ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => openEditForm(post)}
                      disabled={isSubmitting}
                    >
                      수정
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => handleDelete(post.id)}
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

function GraceSharing() {
  return <GraceSharingContent />
}

export default GraceSharing
