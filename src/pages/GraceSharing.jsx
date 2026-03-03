import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import PostComments from '../components/comments/PostComments'
import { useGracePage } from '../features/grace/hooks'
import { canManagePost } from '../features/profile/api'
import { getNkrvBookData, getNkrvBookIndex } from '../features/scripture/nkrvClient'
import {
  extractScriptureRange,
  formatScriptureReference,
  normalizeScriptureRange,
  stringifyScriptureVerses,
} from '../features/scripture/range'

const EMPTY_FORM = {
  title: '',
  content: '',
  isAnonymous: false,
}

const EMPTY_SCRIPTURE_SELECTION = {
  bookId: '',
  startChapter: '',
  startVerse: '',
  endChapter: '',
  endVerse: '',
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

function toStringOrEmpty(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

function getChapterOptions(bookData) {
  if (!bookData?.chapters?.length) {
    return []
  }

  return bookData.chapters.map((chapter) => String(chapter.chapter))
}

function getVerseOptions(bookData, chapterValue) {
  const chapterNumber = Number(chapterValue)
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0 || !bookData?.chapters?.length) {
    return []
  }

  const chapter = bookData.chapters.find((row) => row.chapter === chapterNumber)
  if (!chapter) {
    return []
  }

  return chapter.verses.map((_, index) => String(index + 1))
}

function normalizeScriptureSelection(selection, bookData) {
  if (!selection.bookId || !bookData?.chapters?.length) {
    return {
      ...selection,
      startChapter: '',
      startVerse: '',
      endChapter: '',
      endVerse: '',
    }
  }

  const chapterOptions = getChapterOptions(bookData)
  const startChapter = chapterOptions.includes(selection.startChapter)
    ? selection.startChapter
    : chapterOptions[0] || ''

  let endChapter = chapterOptions.includes(selection.endChapter) ? selection.endChapter : startChapter
  if (Number(endChapter) < Number(startChapter)) {
    endChapter = startChapter
  }

  const startVerseOptions = getVerseOptions(bookData, startChapter)
  const startVerse = startVerseOptions.includes(selection.startVerse)
    ? selection.startVerse
    : startVerseOptions[0] || ''

  const rawEndVerseOptions = getVerseOptions(bookData, endChapter)
  const endVerseOptions =
    endChapter === startChapter
      ? rawEndVerseOptions.filter((verse) => Number(verse) >= Number(startVerse || '0'))
      : rawEndVerseOptions

  const endVerse = endVerseOptions.includes(selection.endVerse)
    ? selection.endVerse
    : endVerseOptions[endVerseOptions.length - 1] || endVerseOptions[0] || ''

  return {
    ...selection,
    startChapter,
    startVerse,
    endChapter,
    endVerse,
  }
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
  const [scriptureSelection, setScriptureSelection] = useState(EMPTY_SCRIPTURE_SELECTION)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [feedback, setFeedback] = useState('')

  const booksQuery = useQuery({
    queryKey: ['nkrv', 'index'],
    queryFn: getNkrvBookIndex,
    staleTime: Infinity,
  })

  const selectedBookId = scriptureSelection.bookId
  const selectedBookQuery = useQuery({
    queryKey: ['nkrv', 'book', selectedBookId],
    queryFn: () => getNkrvBookData(selectedBookId),
    enabled: Boolean(selectedBookId),
    staleTime: Infinity,
  })

  const books = useMemo(() => {
    const rows = booksQuery.data || []
    return [...rows].sort((left, right) => left.order - right.order)
  }, [booksQuery.data])

  const selectedBook = selectedBookQuery.data || null
  const effectiveScriptureSelection = useMemo(() => {
    if (!selectedBook) {
      return scriptureSelection
    }

    return normalizeScriptureSelection(scriptureSelection, selectedBook)
  }, [scriptureSelection, selectedBook])

  const chapterOptions = useMemo(() => getChapterOptions(selectedBook), [selectedBook])

  const startVerseOptions = useMemo(
    () => getVerseOptions(selectedBook, effectiveScriptureSelection.startChapter),
    [selectedBook, effectiveScriptureSelection.startChapter],
  )

  const endChapterOptions = useMemo(() => {
    const startChapter = Number(effectiveScriptureSelection.startChapter)
    if (!Number.isFinite(startChapter) || startChapter <= 0) {
      return chapterOptions
    }

    return chapterOptions.filter((chapter) => Number(chapter) >= startChapter)
  }, [chapterOptions, effectiveScriptureSelection.startChapter])

  const endVerseOptions = useMemo(() => {
    const rawOptions = getVerseOptions(selectedBook, effectiveScriptureSelection.endChapter)

    if (effectiveScriptureSelection.endChapter !== effectiveScriptureSelection.startChapter) {
      return rawOptions
    }

    const startVerse = Number(effectiveScriptureSelection.startVerse)
    if (!Number.isFinite(startVerse) || startVerse <= 0) {
      return rawOptions
    }

    return rawOptions.filter((verse) => Number(verse) >= startVerse)
  }, [
    selectedBook,
    effectiveScriptureSelection.endChapter,
    effectiveScriptureSelection.startChapter,
    effectiveScriptureSelection.startVerse,
  ])

  const scripturePreview = useMemo(() => {
    if (!selectedBook || !effectiveScriptureSelection.bookId) {
      return null
    }

    const range = normalizeScriptureRange(effectiveScriptureSelection)
    if (!range) {
      return null
    }

    const verses = extractScriptureRange(selectedBook, range)
    if (verses.length === 0) {
      return null
    }

    return {
      reference: formatScriptureReference({
        bookName: selectedBook.name,
        startChapter: range.startChapter,
        startVerse: range.startVerse,
        endChapter: range.endChapter,
        endVerse: range.endVerse,
      }),
      text: stringifyScriptureVerses(verses),
    }
  }, [selectedBook, effectiveScriptureSelection])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setScriptureSelection(EMPTY_SCRIPTURE_SELECTION)
    setEditingId(null)
  }

  const openCreateForm = () => {
    resetForm()
    setFeedback('')
    setIsFormOpen((prev) => !prev)
  }

  const openEditForm = (post) => {
    setForm({
      title: post.title,
      content: post.content,
      isAnonymous: Boolean(post.isAnonymous),
    })

    setScriptureSelection(
      post.scripture
        ? {
          bookId: toStringOrEmpty(post.scripture.bookId),
          startChapter: toStringOrEmpty(post.scripture.startChapter),
          startVerse: toStringOrEmpty(post.scripture.startVerse),
          endChapter: toStringOrEmpty(post.scripture.endChapter),
          endVerse: toStringOrEmpty(post.scripture.endVerse),
        }
        : EMPTY_SCRIPTURE_SELECTION,
    )

    setEditingId(post.id)
    setIsFormOpen(true)
    setFeedback('')
  }

  const buildScripturePayload = () => {
    if (!effectiveScriptureSelection.bookId) {
      return null
    }

    if (!selectedBook) {
      throw new Error('선택한 성경 본문 데이터를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.')
    }

    const range = normalizeScriptureRange(effectiveScriptureSelection)
    if (!range) {
      throw new Error('성경 범위를 정확히 선택해 주세요.')
    }

    const verses = extractScriptureRange(selectedBook, range)
    if (verses.length === 0) {
      throw new Error('선택한 성경 범위의 본문을 찾지 못했습니다.')
    }

    const reference = formatScriptureReference({
      bookName: selectedBook.name,
      startChapter: range.startChapter,
      startVerse: range.startVerse,
      endChapter: range.endChapter,
      endVerse: range.endVerse,
    })

    return {
      bookId: selectedBook.id,
      bookName: selectedBook.name,
      startChapter: range.startChapter,
      startVerse: range.startVerse,
      endChapter: range.endChapter,
      endVerse: range.endVerse,
      reference,
      text: stringifyScriptureVerses(verses),
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      const payload = {
        ...form,
        scripture: buildScripturePayload(),
      }

      if (editingId) {
        await updatePost({ postId: editingId, payload })
        setFeedback('글이 수정되었습니다.')
      } else {
        await createPost(payload)
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

  const handleScriptureBookChange = (bookId) => {
    if (!bookId) {
      setScriptureSelection(EMPTY_SCRIPTURE_SELECTION)
      return
    }

    setScriptureSelection({
      ...EMPTY_SCRIPTURE_SELECTION,
      bookId,
    })
  }

  const handleScriptureFieldChange = (field, value) => {
    setScriptureSelection((prev) => {
      const next = {
        ...prev,
        [field]: value,
      }

      if (!selectedBook) {
        return next
      }

      return normalizeScriptureSelection(next, selectedBook)
    })
  }

  const scriptureError = booksQuery.error || selectedBookQuery.error || null

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

      {scriptureError ? (
        <div
          className="glass"
          style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}
        >
          <p style={{ color: '#ef4444', fontSize: '0.9rem' }}>
            NKRV 본문 데이터를 불러오지 못했습니다. ({scriptureError.message})
          </p>
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
            className="form-control"
            required
          />
          <textarea
            value={form.content}
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="은혜를 자유롭게 나눠주세요"
            rows={4}
            className="form-control"
            required
          />

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={form.isAnonymous}
              onChange={(event) => setForm((prev) => ({ ...prev, isAnonymous: event.target.checked }))}
            />
            익명으로 올리기
          </label>

          <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.8rem', display: 'grid', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>성경 범위 선택 (선택)</p>
              {scriptureSelection.bookId ? (
                <button type="button" className="btn-secondary" onClick={() => setScriptureSelection(EMPTY_SCRIPTURE_SELECTION)}>
                  본문 선택 해제
                </button>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <select
                value={effectiveScriptureSelection.bookId}
                onChange={(event) => handleScriptureBookChange(event.target.value)}
                className="form-control"
              >
                <option value="">권 선택 안 함</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.name}
                  </option>
                ))}
              </select>

              <select
                value={effectiveScriptureSelection.startChapter}
                onChange={(event) => handleScriptureFieldChange('startChapter', event.target.value)}
                disabled={!effectiveScriptureSelection.bookId || chapterOptions.length === 0}
                className="form-control"
              >
                <option value="">시작 장</option>
                {chapterOptions.map((chapter) => (
                  <option key={`start-chapter-${chapter}`} value={chapter}>
                    {chapter}장
                  </option>
                ))}
              </select>

              <select
                value={effectiveScriptureSelection.startVerse}
                onChange={(event) => handleScriptureFieldChange('startVerse', event.target.value)}
                disabled={!effectiveScriptureSelection.startChapter || startVerseOptions.length === 0}
                className="form-control"
              >
                <option value="">시작 절</option>
                {startVerseOptions.map((verse) => (
                  <option key={`start-verse-${verse}`} value={verse}>
                    {verse}절
                  </option>
                ))}
              </select>

              <select
                value={effectiveScriptureSelection.endChapter}
                onChange={(event) => handleScriptureFieldChange('endChapter', event.target.value)}
                disabled={!effectiveScriptureSelection.startChapter || endChapterOptions.length === 0}
                className="form-control"
              >
                <option value="">끝 장</option>
                {endChapterOptions.map((chapter) => (
                  <option key={`end-chapter-${chapter}`} value={chapter}>
                    {chapter}장
                  </option>
                ))}
              </select>

              <select
                value={effectiveScriptureSelection.endVerse}
                onChange={(event) => handleScriptureFieldChange('endVerse', event.target.value)}
                disabled={!effectiveScriptureSelection.endChapter || endVerseOptions.length === 0}
                className="form-control"
              >
                <option value="">끝 절</option>
                {endVerseOptions.map((verse) => (
                  <option key={`end-verse-${verse}`} value={verse}>
                    {verse}절
                  </option>
                ))}
              </select>
            </div>

            {selectedBookQuery.isLoading && effectiveScriptureSelection.bookId ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>본문을 불러오는 중입니다...</p>
            ) : null}

            {scripturePreview ? (
              <div style={{ border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.7rem', display: 'grid', gap: '0.4rem', backgroundColor: 'var(--bg-secondary)' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{scripturePreview.reference} (NKRV)</p>
                <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: '0.86rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {scripturePreview.text}
                </p>
              </div>
            ) : null}
          </div>

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
            <button className="btn-primary" type="submit" disabled={isSubmitting || booksQuery.isLoading}>
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
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {post.authorName}
                    {post.isAnonymous ? (
                      <span
                        style={{
                          marginLeft: '0.4rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#0f766e',
                          backgroundColor: '#ccfbf1',
                          borderRadius: '999px',
                          padding: '0.12rem 0.4rem',
                        }}
                      >
                        익명
                      </span>
                    ) : null}
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {formatRelativeDate(post.createdAt)}
                  </p>
                </div>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{post.title}</h3>
              <p style={{ color: 'var(--text-primary)', opacity: 0.9, whiteSpace: 'pre-wrap' }}>{post.content}</p>

              {post.scripture?.reference ? (
                <div style={{ marginTop: '0.8rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.7rem', backgroundColor: 'var(--bg-secondary)', display: 'grid', gap: '0.35rem' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.86rem' }}>{post.scripture.reference} (NKRV)</p>
                  <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{post.scripture.text}</p>
                </div>
              ) : null}

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

              <PostComments postType="grace" postId={post.id} />
            </article>
          )
        })}
      </div>
    </div>
  )
}



function GraceSharing() {
  return <GraceSharingContent />
}

export default GraceSharing
