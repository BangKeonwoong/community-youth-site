import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const MEETUPS_TABLE = import.meta.env.VITE_SUPABASE_MEETUPS_TABLE || 'meetups'
const PARTICIPANTS_TABLE =
  import.meta.env.VITE_SUPABASE_MEETUP_PARTICIPANTS_TABLE || 'meetup_participants'
const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'

function toNumber(value, defaultValue = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : defaultValue
}

function toDateIso(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

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

function normalizeMeetup(row, participants, profileMap, currentProfileId) {
  const participantCount = participants.filter(
    (participant) => participant.meetup_id === row.id && participant.status !== 'cancelled',
  ).length

  const isParticipating = participants.some(
    (participant) => participant.meetup_id === row.id && participant.user_id === currentProfileId,
  )

  return {
    id: row.id,
    title: row.title || '제목 없음',
    description: row.description || '',
    location: row.location || '',
    eventAt: row.starts_at || null,
    capacity: toNumber(row.capacity, 0),
    authorId: row.created_by || null,
    authorName: profileMap.get(row.created_by) || '이름 미상',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    participantCount,
    isParticipating,
  }
}

function assertProfile(profile) {
  if (!profile?.id) {
    throw new Error('프로필을 확인할 수 없어 요청을 처리할 수 없습니다.')
  }
}

function assertTitle(title) {
  if (!title || !title.trim()) {
    throw new Error('모임 제목을 입력해주세요.')
  }
}

export async function listMeetups(currentProfileId) {
  requireSupabaseConfigured()

  const [{ data: meetups, error: meetupsError }, { data: participants, error: participantsError }] =
    await Promise.all([
      supabase.from(MEETUPS_TABLE).select('*').order('starts_at', { ascending: true }),
      supabase.from(PARTICIPANTS_TABLE).select('meetup_id, user_id, status'),
    ])

  if (meetupsError) {
    throw toError(meetupsError, '모임 목록을 불러오지 못했습니다.')
  }

  if (participantsError) {
    throw toError(participantsError, '모임 참여 정보를 불러오지 못했습니다.')
  }

  const rows = meetups || []
  const participantRows = participants || []
  const profileMap = await fetchProfileNameMap(rows.map((row) => row.created_by))

  return rows.map((row) => normalizeMeetup(row, participantRows, profileMap, currentProfileId))
}

export async function createMeetup(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)
  assertTitle(payload.title)

  const startsAt = toDateIso(payload.eventAt) || new Date().toISOString()
  const capacity = toNumber(payload.capacity, 0)

  const { data, error } = await supabase
    .from(MEETUPS_TABLE)
    .insert({
      title: payload.title.trim(),
      description: payload.description?.trim() || '',
      location: payload.location?.trim() || '',
      starts_at: startsAt,
      capacity: capacity > 0 ? capacity : null,
      created_by: profile.id,
    })
    .select('*')
    .single()

  if (error) {
    throw toError(error, '모임 생성에 실패했습니다.')
  }

  return data
}

export async function updateMeetup(meetupId, payload) {
  requireSupabaseConfigured()
  assertTitle(payload.title)

  const startsAt = toDateIso(payload.eventAt) || new Date().toISOString()
  const capacity = toNumber(payload.capacity, 0)

  const { data, error } = await supabase
    .from(MEETUPS_TABLE)
    .update({
      title: payload.title.trim(),
      description: payload.description?.trim() || '',
      location: payload.location?.trim() || '',
      starts_at: startsAt,
      capacity: capacity > 0 ? capacity : null,
    })
    .eq('id', meetupId)
    .select('*')
    .single()

  if (error) {
    throw toError(error, '모임 수정에 실패했습니다.')
  }

  return data
}

export async function deleteMeetup(meetupId) {
  requireSupabaseConfigured()

  const { error } = await supabase.from(MEETUPS_TABLE).delete().eq('id', meetupId)

  if (error) {
    throw toError(error, '모임 삭제에 실패했습니다.')
  }
}

async function getParticipationRecord(meetupId, userId) {
  const { data, error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select('meetup_id, user_id')
    .eq('meetup_id', meetupId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw toError(error, '참여 상태를 확인하지 못했습니다.')
  }

  return data
}

async function assertCapacityAvailable(meetupId) {
  const [{ data: meetup, error: meetupError }, { count, error: countError }] = await Promise.all([
    supabase.from(MEETUPS_TABLE).select('id, capacity').eq('id', meetupId).single(),
    supabase
      .from(PARTICIPANTS_TABLE)
      .select('meetup_id', { count: 'exact', head: true })
      .eq('meetup_id', meetupId)
      .neq('status', 'cancelled'),
  ])

  if (meetupError) {
    throw toError(meetupError, '모임 정보를 확인하지 못했습니다.')
  }

  if (countError) {
    throw toError(countError, '참여 인원을 확인하지 못했습니다.')
  }

  const capacity = toNumber(meetup.capacity, 0)
  if (capacity > 0 && (count || 0) >= capacity) {
    throw new Error('이미 정원이 가득 찬 모임입니다.')
  }
}

export async function toggleMeetupParticipation(meetupId, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const existing = await getParticipationRecord(meetupId, profile.id)
  if (existing) {
    const { error } = await supabase
      .from(PARTICIPANTS_TABLE)
      .delete()
      .eq('meetup_id', meetupId)
      .eq('user_id', profile.id)

    if (error) {
      throw toError(error, '참여 취소에 실패했습니다.')
    }

    return { participating: false }
  }

  await assertCapacityAvailable(meetupId)

  const { error } = await supabase.from(PARTICIPANTS_TABLE).insert({
    meetup_id: meetupId,
    user_id: profile.id,
    status: 'joined',
  })

  if (error) {
    throw toError(error, '모임 참여에 실패했습니다.')
  }

  return { participating: true }
}
