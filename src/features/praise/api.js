import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const PRAISE_TABLE = import.meta.env.VITE_SUPABASE_PRAISE_TABLE || 'praise_recommendations'
const PRAISE_LIKES_TABLE = import.meta.env.VITE_SUPABASE_PRAISE_LIKES_TABLE || 'praise_likes'
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

function getYoutubeVideoId(url) {
  if (!url) {
    return null
  }

  try {
    const parsedUrl = new URL(url)

    if (parsedUrl.hostname.includes('youtu.be')) {
      return parsedUrl.pathname.replace('/', '') || null
    }

    if (parsedUrl.hostname.includes('youtube.com')) {
      return parsedUrl.searchParams.get('v')
    }
  } catch {
    return null
  }

  return null
}

function toThumbnailUrl(videoUrl) {
  const videoId = getYoutubeVideoId(videoUrl)
  if (!videoId) {
    return null
  }

  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
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
    throw new Error('찬양 제목을 입력해주세요.')
  }
}

function normalizePraise(row, likes, profileMap, currentProfileId) {
  const likeCount = likes.filter((like) => like.recommendation_id === row.id).length
  const likedByMe = likes.some(
    (like) => like.recommendation_id === row.id && like.user_id === currentProfileId,
  )

  return {
    id: row.id,
    title: row.title || '제목 없음',
    artist: row.artist || '',
    note: row.note || '',
    youtubeUrl: row.youtube_url || '',
    thumbnailUrl: toThumbnailUrl(row.youtube_url || ''),
    authorId: row.author_id || null,
    authorName: profileMap.get(row.author_id) || '이름 미상',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    likeCount,
    likedByMe,
  }
}

export async function listPraiseRecommendations(currentProfileId) {
  requireSupabaseConfigured()

  const [{ data: recommendations, error: recommendationsError }, { data: likes, error: likesError }] =
    await Promise.all([
      supabase.from(PRAISE_TABLE).select('*').order('created_at', { ascending: false }),
      supabase.from(PRAISE_LIKES_TABLE).select('recommendation_id, user_id'),
    ])

  if (recommendationsError) {
    throw toError(recommendationsError, '찬양 추천을 불러오지 못했습니다.')
  }

  if (likesError) {
    throw toError(likesError, '찬양 좋아요 정보를 불러오지 못했습니다.')
  }

  const rows = recommendations || []
  const likeRows = likes || []
  const profileMap = await fetchProfileNameMap(rows.map((row) => row.author_id))

  return rows.map((row) => normalizePraise(row, likeRows, profileMap, currentProfileId))
}

export async function createPraiseRecommendation(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)
  assertTitle(payload.title)

  const { data, error } = await supabase
    .from(PRAISE_TABLE)
    .insert({
      title: payload.title.trim(),
      artist: payload.artist?.trim() || '',
      youtube_url: payload.youtubeUrl?.trim() || null,
      note: payload.note?.trim() || '',
      author_id: profile.id,
    })
    .select('*')
    .single()

  if (error) {
    throw toError(error, '찬양 추천 등록에 실패했습니다.')
  }

  return data
}

export async function updatePraiseRecommendation(recommendationId, payload) {
  requireSupabaseConfigured()
  assertTitle(payload.title)

  const { data, error } = await supabase
    .from(PRAISE_TABLE)
    .update({
      title: payload.title.trim(),
      artist: payload.artist?.trim() || '',
      youtube_url: payload.youtubeUrl?.trim() || null,
      note: payload.note?.trim() || '',
    })
    .eq('id', recommendationId)
    .select('*')
    .single()

  if (error) {
    throw toError(error, '찬양 추천 수정에 실패했습니다.')
  }

  return data
}

export async function deletePraiseRecommendation(recommendationId) {
  requireSupabaseConfigured()

  const { error } = await supabase.from(PRAISE_TABLE).delete().eq('id', recommendationId)

  if (error) {
    throw toError(error, '찬양 추천 삭제에 실패했습니다.')
  }
}

async function getLikeRecord(recommendationId, userId) {
  const { data, error } = await supabase
    .from(PRAISE_LIKES_TABLE)
    .select('recommendation_id, user_id')
    .eq('recommendation_id', recommendationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw toError(error, '좋아요 상태 확인에 실패했습니다.')
  }

  return data
}

export async function togglePraiseLike(recommendationId, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const existing = await getLikeRecord(recommendationId, profile.id)
  if (existing) {
    const { error } = await supabase
      .from(PRAISE_LIKES_TABLE)
      .delete()
      .eq('recommendation_id', recommendationId)
      .eq('user_id', profile.id)

    if (error) {
      throw toError(error, '좋아요 취소에 실패했습니다.')
    }

    return { liked: false }
  }

  const { error } = await supabase.from(PRAISE_LIKES_TABLE).insert({
    recommendation_id: recommendationId,
    user_id: profile.id,
  })

  if (error) {
    throw toError(error, '좋아요 처리에 실패했습니다.')
  }

  return { liked: true }
}
