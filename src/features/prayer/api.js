import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const PRAYER_TABLE = import.meta.env.VITE_SUPABASE_PRAYER_TABLE || 'prayer_requests'
const PRAYER_SUPPORT_TABLE = import.meta.env.VITE_SUPABASE_PRAYER_SUPPORT_TABLE || 'prayer_supports'
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
    throw new Error('기도제목 제목을 입력해주세요.')
  }
}

function assertContent(content) {
  if (!content || !content.trim()) {
    throw new Error('기도제목 내용을 입력해주세요.')
  }
}

function normalizePrayerRequest(row, supports, profileMap, currentProfileId) {
  const prayerCount = supports.filter((support) => support.request_id === row.id).length
  const prayedByMe = supports.some(
    (support) => support.request_id === row.id && support.user_id === currentProfileId,
  )
  const isAnonymous = Boolean(row.is_anonymous)

  return {
    id: row.id,
    title: row.title || '제목 없음',
    content: row.content || '',
    authorId: row.author_id || null,
    authorName: isAnonymous ? '익명' : profileMap.get(row.author_id) || '이름 미상',
    isAnonymous,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    prayerCount,
    prayedByMe,
  }
}

export async function listPrayerRequests(currentProfileId) {
  requireSupabaseConfigured()

  const [{ data: requests, error: requestsError }, { data: supports, error: supportsError }] =
    await Promise.all([
      supabase.from(PRAYER_TABLE).select('*').order('created_at', { ascending: false }),
      supabase.from(PRAYER_SUPPORT_TABLE).select('request_id, user_id'),
    ])

  if (requestsError) {
    throw toError(requestsError, '기도제목을 불러오지 못했습니다.')
  }

  if (supportsError) {
    throw toError(supportsError, '기도 응답 정보를 불러오지 못했습니다.')
  }

  const rows = requests || []
  const supportRows = supports || []
  const profileMap = await fetchProfileNameMap(rows.map((row) => row.author_id))

  return rows.map((row) => normalizePrayerRequest(row, supportRows, profileMap, currentProfileId))
}

function toPrayerMutationRow(payload) {
  return {
    title: payload.title.trim(),
    content: payload.content.trim(),
    is_anonymous: Boolean(payload?.isAnonymous),
  }
}

export async function createPrayerRequest(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)
  assertTitle(payload.title)
  assertContent(payload.content)

  const { data, error } = await supabase
    .from(PRAYER_TABLE)
    .insert({
      ...toPrayerMutationRow(payload),
      author_id: profile.id,
    })
    .select('*')
    .single()

  if (error) {
    throw toError(error, '기도제목 등록에 실패했습니다.')
  }

  return data
}

export async function updatePrayerRequest(requestId, payload) {
  requireSupabaseConfigured()
  assertTitle(payload.title)
  assertContent(payload.content)

  const { data, error } = await supabase
    .from(PRAYER_TABLE)
    .update(toPrayerMutationRow(payload))
    .eq('id', requestId)
    .select('*')
    .single()

  if (error) {
    throw toError(error, '기도제목 수정에 실패했습니다.')
  }

  return data
}

export async function deletePrayerRequest(requestId) {
  requireSupabaseConfigured()

  const { error } = await supabase.from(PRAYER_TABLE).delete().eq('id', requestId)

  if (error) {
    throw toError(error, '기도제목 삭제에 실패했습니다.')
  }
}

async function getSupportRecord(requestId, userId) {
  const { data, error } = await supabase
    .from(PRAYER_SUPPORT_TABLE)
    .select('request_id, user_id')
    .eq('request_id', requestId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw toError(error, '기도 응답 상태 확인에 실패했습니다.')
  }

  return data
}

export async function togglePrayerSupport(requestId, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const existing = await getSupportRecord(requestId, profile.id)
  if (existing) {
    const { error } = await supabase
      .from(PRAYER_SUPPORT_TABLE)
      .delete()
      .eq('request_id', requestId)
      .eq('user_id', profile.id)

    if (error) {
      throw toError(error, '기도 응답 취소에 실패했습니다.')
    }

    return { prayed: false }
  }

  const { error } = await supabase.from(PRAYER_SUPPORT_TABLE).insert({
    request_id: requestId,
    user_id: profile.id,
  })

  if (error) {
    throw toError(error, '기도 응답 처리에 실패했습니다.')
  }

  return { prayed: true }
}
