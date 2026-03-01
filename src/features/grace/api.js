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

function normalizeGracePost(row, likes, profileMap, currentProfileId) {
  const likeCount = likes.filter((like) => like.post_id === row.id).length
  const likedByMe = likes.some((like) => like.post_id === row.id && like.user_id === currentProfileId)

  return {
    id: row.id,
    title: row.title || '제목 없음',
    content: row.content || '',
    authorId: row.author_id || null,
    authorName: profileMap.get(row.author_id) || '이름 미상',
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

export async function createGracePost(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)
  assertTitle(payload.title)
  assertContent(payload.content)

  const { data, error } = await supabase
    .from(GRACE_TABLE)
    .insert({
      title: payload.title.trim(),
      content: payload.content.trim(),
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
    .update({
      title: payload.title.trim(),
      content: payload.content.trim(),
    })
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
