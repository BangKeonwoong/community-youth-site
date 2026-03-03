import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const GRACE_TABLE = import.meta.env.VITE_SUPABASE_GRACE_TABLE || 'grace_posts'
const GRACE_LIKES_TABLE = import.meta.env.VITE_SUPABASE_GRACE_LIKES_TABLE || 'grace_post_likes'
const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'

function toError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  const nextError = new Error(error.message || fallbackMessage)
  nextError.code = error.code
  nextError.status = error.status
  return nextError
}

async function fetchProfileNameMap(profileIds) {
  const ids = [...new Set(profileIds.filter(Boolean))]
  if (ids.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select('id, display_name')
    .in('id', ids)

  if (error) {
    throw toError(error, '작성자 정보를 불러오지 못했습니다.')
  }

  const map = new Map()
  ;(data || []).forEach((row) => {
    map.set(row.id, row.display_name || '이름 미상')
  })
  return map
}

function assertProfile(profile) {
  if (!profile?.id) {
    throw new Error('프로필을 확인할 수 없어 요청을 처리할 수 없습니다.')
  }
}

function assertTitle(title) {
  if (!title || !title.trim()) {
    throw new Error('글 제목을 입력해주세요.')
  }
}

function assertContent(content) {
  if (!content || !content.trim()) {
    throw new Error('글 내용을 입력해주세요.')
  }
}

function toOptionalTrimmedText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function toPositiveIntegerOrNull(value) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.floor(parsed)
}

function normalizeScripturePayload(rawScripture) {
  if (!rawScripture || typeof rawScripture !== 'object') {
    return null
  }

  const normalized = {
    bookId: toOptionalTrimmedText(rawScripture.bookId),
    bookName: toOptionalTrimmedText(rawScripture.bookName),
    startChapter: toPositiveIntegerOrNull(rawScripture.startChapter),
    startVerse: toPositiveIntegerOrNull(rawScripture.startVerse),
    endChapter: toPositiveIntegerOrNull(rawScripture.endChapter),
    endVerse: toPositiveIntegerOrNull(rawScripture.endVerse),
    reference: toOptionalTrimmedText(rawScripture.reference),
    text: toOptionalTrimmedText(rawScripture.text),
  }

  const hasAnyField = Object.values(normalized).some(Boolean)
  if (!hasAnyField) {
    return null
  }

  if (
    !normalized.bookId ||
    !normalized.bookName ||
    !normalized.startChapter ||
    !normalized.startVerse ||
    !normalized.endChapter ||
    !normalized.endVerse ||
    !normalized.reference ||
    !normalized.text
  ) {
    throw new Error('성경 범위를 정확히 선택해 주세요.')
  }

  if (
    normalized.endChapter < normalized.startChapter ||
    (normalized.endChapter === normalized.startChapter && normalized.endVerse < normalized.startVerse)
  ) {
    throw new Error('성경 범위의 시작/끝 구절이 올바르지 않습니다.')
  }

  if (normalized.reference.length > 120) {
    throw new Error('성경 범위 표시는 120자 이하로 입력해 주세요.')
  }

  if (normalized.text.length > 20000) {
    throw new Error('선택한 성경 본문이 너무 깁니다. 범위를 줄여 주세요.')
  }

  return normalized
}

function toScriptureColumns(rawScripture) {
  const scripture = normalizeScripturePayload(rawScripture)

  if (!scripture) {
    return {
      scripture_book_id: null,
      scripture_book_name: null,
      scripture_start_chapter: null,
      scripture_start_verse: null,
      scripture_end_chapter: null,
      scripture_end_verse: null,
      scripture_reference: null,
      scripture_text: null,
    }
  }

  return {
    scripture_book_id: scripture.bookId,
    scripture_book_name: scripture.bookName,
    scripture_start_chapter: scripture.startChapter,
    scripture_start_verse: scripture.startVerse,
    scripture_end_chapter: scripture.endChapter,
    scripture_end_verse: scripture.endVerse,
    scripture_reference: scripture.reference,
    scripture_text: scripture.text,
  }
}

function normalizeGracePost(row, likes, profileMap, currentProfileId) {
  const likeCount = likes.filter((like) => like.post_id === row.id).length
  const likedByMe = likes.some((like) => like.post_id === row.id && like.user_id === currentProfileId)
  const isAnonymous = Boolean(row.is_anonymous)

  return {
    id: row.id,
    title: row.title || '제목 없음',
    content: row.content || '',
    authorId: row.author_id || null,
    authorName: isAnonymous ? '익명' : profileMap.get(row.author_id) || '이름 미상',
    isAnonymous,
    scripture: row.scripture_book_id
      ? {
          bookId: row.scripture_book_id,
          bookName: row.scripture_book_name || '',
          startChapter: row.scripture_start_chapter,
          startVerse: row.scripture_start_verse,
          endChapter: row.scripture_end_chapter,
          endVerse: row.scripture_end_verse,
          reference: row.scripture_reference || '',
          text: row.scripture_text || '',
        }
      : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    likeCount,
    likedByMe,
  }
}

export async function listGracePosts(currentProfileId) {
  requireSupabaseConfigured()

  const [{ data: posts, error: postsError }, { data: likes, error: likesError }] = await Promise.all([
    supabase.from(GRACE_TABLE).select('*').order('created_at', { ascending: false }),
    supabase.from(GRACE_LIKES_TABLE).select('post_id, user_id'),
  ])

  if (postsError) {
    throw toError(postsError, '은혜 나눔을 불러오지 못했습니다.')
  }

  if (likesError) {
    throw toError(likesError, '좋아요 정보를 불러오지 못했습니다.')
  }

  const rows = posts || []
  const likeRows = likes || []
  const profileMap = await fetchProfileNameMap(rows.map((row) => row.author_id))

  return rows.map((row) => normalizeGracePost(row, likeRows, profileMap, currentProfileId))
}

function toGraceMutationRow(payload) {
  return {
    title: payload.title.trim(),
    content: payload.content.trim(),
    is_anonymous: Boolean(payload?.isAnonymous),
    ...toScriptureColumns(payload?.scripture),
  }
}

export async function createGracePost(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)
  assertTitle(payload.title)
  assertContent(payload.content)

  const { data, error } = await supabase
    .from(GRACE_TABLE)
    .insert({
      ...toGraceMutationRow(payload),
      author_id: profile.id,
    })
    .select('*')
    .single()

  if (error) {
    throw toError(error, '은혜 나눔 등록에 실패했습니다.')
  }

  return data
}

export async function updateGracePost(postId, payload) {
  requireSupabaseConfigured()
  assertTitle(payload.title)
  assertContent(payload.content)

  const { data, error } = await supabase
    .from(GRACE_TABLE)
    .update(toGraceMutationRow(payload))
    .eq('id', postId)
    .select('*')
    .single()

  if (error) {
    throw toError(error, '은혜 나눔 수정에 실패했습니다.')
  }

  return data
}

export async function deleteGracePost(postId) {
  requireSupabaseConfigured()

  const { error } = await supabase.from(GRACE_TABLE).delete().eq('id', postId)

  if (error) {
    throw toError(error, '은혜 나눔 삭제에 실패했습니다.')
  }
}

async function getLikeRecord(postId, userId) {
  const { data, error } = await supabase
    .from(GRACE_LIKES_TABLE)
    .select('post_id, user_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw toError(error, '좋아요 상태 확인에 실패했습니다.')
  }

  return data
}

export async function toggleGraceLike(postId, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const existing = await getLikeRecord(postId, profile.id)
  if (existing) {
    const { error } = await supabase
      .from(GRACE_LIKES_TABLE)
      .delete()
      .eq('post_id', postId)
      .eq('user_id', profile.id)

    if (error) {
      throw toError(error, '좋아요 취소에 실패했습니다.')
    }

    return { liked: false }
  }

  const { error } = await supabase.from(GRACE_LIKES_TABLE).insert({
    post_id: postId,
    user_id: profile.id,
  })

  if (error) {
    throw toError(error, '좋아요 처리에 실패했습니다.')
  }

  return { liked: true }
}
