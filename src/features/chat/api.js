import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const CHAT_ROOMS_TABLE = import.meta.env.VITE_SUPABASE_CHAT_ROOMS_TABLE || 'chat_rooms'
const CHAT_MESSAGES_TABLE = import.meta.env.VITE_SUPABASE_CHAT_MESSAGES_TABLE || 'chat_messages'
const CHAT_ROOM_MEMBERS_TABLE = import.meta.env.VITE_SUPABASE_CHAT_ROOM_MEMBERS_TABLE || 'chat_room_members'
const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'
const MEMBERSHIP_USER_FIELD_CANDIDATES = ['user_id', 'profile_id']
const MEMBERSHIP_ROLE_FIELD_CANDIDATES = ['role', 'member_role']

function toError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  const nextError = new Error(error.message || fallbackMessage)
  nextError.code = error.code
  nextError.status = error.status
  return nextError
}

function normalizeName(value, fallback = '이름 미상') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function assertProfile(profile) {
  if (!profile?.id) {
    throw new Error('프로필을 확인할 수 없어 요청을 처리할 수 없습니다.')
  }
}

function assertRoomName(name) {
  const text = String(name ?? '').trim()
  if (text.length < 2 || text.length > 60) {
    throw new Error('채팅방 이름은 2자 이상 60자 이하로 입력해 주세요.')
  }

  return text
}

function normalizeDescription(value) {
  const text = String(value ?? '').trim()
  if (text.length > 500) {
    throw new Error('채팅방 설명은 500자 이하로 입력해 주세요.')
  }

  return text
}

function assertMessageContent(content) {
  const text = String(content ?? '').trim()
  if (!text) {
    throw new Error('메시지를 입력해 주세요.')
  }

  if (text.length > 2000) {
    throw new Error('메시지는 2000자 이하로 입력해 주세요.')
  }

  return text
}

function normalizeRoomId(roomId) {
  const value = Number(roomId)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function normalizeMemberRole(role) {
  const text = String(role ?? '')
    .trim()
    .toLowerCase()

  return text || null
}

function resolveMembershipUserId(row) {
  return row?.user_id ?? row?.profile_id ?? row?.member_id ?? null
}

function resolveMembershipRole(row) {
  return normalizeMemberRole(row?.role ?? row?.member_role ?? row?.memberRole)
}

function isMissingColumnError(error) {
  if (!error) {
    return false
  }

  if (error.code === '42703' || error.code === 'PGRST204') {
    return true
  }

  const message = String(error.message || '').toLowerCase()
  return message.includes('column') && message.includes('does not exist')
}

function isDuplicateMembershipError(error) {
  if (!error) {
    return false
  }

  if (error.code === '23505') {
    return true
  }

  return String(error.message || '').toLowerCase().includes('duplicate key')
}

function buildMembershipInsertPayloads({ roomId, profileId, role }) {
  const payloads = []

  MEMBERSHIP_USER_FIELD_CANDIDATES.forEach((userField) => {
    MEMBERSHIP_ROLE_FIELD_CANDIDATES.forEach((roleField) => {
      payloads.push({
        room_id: roomId,
        [userField]: profileId,
        [roleField]: role,
      })
    })

    payloads.push({
      room_id: roomId,
      [userField]: profileId,
    })
  })

  return payloads
}

async function fetchProfileNameMap(profileIds) {
  const ids = [...new Set((profileIds || []).filter(Boolean))]
  if (ids.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase.from(PROFILE_TABLE).select('id, display_name').in('id', ids)

  if (error) {
    throw toError(error, '프로필 정보를 불러오지 못했습니다.')
  }

  const map = new Map()
  ;(data || []).forEach((row) => {
    map.set(row.id, normalizeName(row.display_name))
  })

  return map
}

async function fetchRoomMembershipMeta(roomIds, currentProfileId) {
  const safeRoomIds = [...new Set((roomIds || []).map((roomId) => normalizeRoomId(roomId)).filter(Boolean))]
  if (safeRoomIds.length === 0) {
    return {
      memberCountMap: new Map(),
      currentMemberRoleMap: new Map(),
    }
  }

  const { data, error } = await supabase
    .from(CHAT_ROOM_MEMBERS_TABLE)
    .select('*')
    .in('room_id', safeRoomIds)

  if (error) {
    throw toError(error, '채팅방 멤버 정보를 불러오지 못했습니다.')
  }

  const memberCountMap = new Map()
  const currentMemberRoleMap = new Map()

  ;(data || []).forEach((row) => {
    const roomId = normalizeRoomId(row?.room_id)
    if (!roomId) {
      return
    }

    memberCountMap.set(roomId, (memberCountMap.get(roomId) || 0) + 1)

    const memberId = resolveMembershipUserId(row)
    if (currentProfileId && memberId === currentProfileId && !currentMemberRoleMap.has(roomId)) {
      currentMemberRoleMap.set(roomId, resolveMembershipRole(row) || 'member')
    }
  })

  return {
    memberCountMap,
    currentMemberRoleMap,
  }
}

function normalizeChatRoom(row, profileMap, latestMessageMap, currentProfileId, membershipMeta) {
  const roomId = normalizeRoomId(row?.id)
  const latestMessage = latestMessageMap.get(roomId)
  const isOwner = Boolean(currentProfileId && row?.created_by && currentProfileId === row.created_by)
  const memberRoleByMembership = membershipMeta?.currentMemberRoleMap?.get(roomId) || null
  const memberRole = memberRoleByMembership || (isOwner ? 'owner' : null)
  const rawMemberCount = Number(membershipMeta?.memberCountMap?.get(roomId) ?? 0)
  const safeMemberCount = Number.isFinite(rawMemberCount) ? rawMemberCount : 0
  const memberCount = Math.max(isOwner ? 1 : 0, safeMemberCount)

  return {
    id: row?.id ?? null,
    name: normalizeName(row?.name, '이름 없는 채팅방'),
    description: String(row?.description ?? ''),
    createdBy: row?.created_by ?? null,
    createdByName: profileMap.get(row?.created_by) || '이름 미상',
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
    lastMessageAt: row?.last_message_at ?? null,
    isArchived: Boolean(row?.is_archived),
    latestMessagePreview: latestMessage
      ? latestMessage.is_deleted
        ? '삭제된 메시지'
        : String(latestMessage.content || '').trim() || '(내용 없음)'
      : '',
    isOwner,
    isMember: Boolean(memberRole || isOwner),
    memberRole,
    memberCount,
  }
}

function normalizeChatMessage(row, profileMap, currentProfileId) {
  return {
    id: row?.id ?? null,
    roomId: row?.room_id ?? null,
    authorId: row?.author_id ?? null,
    authorName: profileMap.get(row?.author_id) || '이름 미상',
    content: String(row?.content ?? ''),
    isDeleted: Boolean(row?.is_deleted),
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
    editedAt: row?.edited_at ?? null,
    deletedAt: row?.deleted_at ?? null,
    isMine: Boolean(currentProfileId && row?.author_id && currentProfileId === row.author_id),
    clientId: null,
    sendState: 'sent',
    sendError: null,
  }
}

export async function listChatRooms(currentProfileId = null) {
  requireSupabaseConfigured()

  const { data, error } = await supabase
    .from(CHAT_ROOMS_TABLE)
    .select('*')
    .eq('is_archived', false)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw toError(error, '채팅방 목록을 불러오지 못했습니다.')
  }

  const rows = data || []
  const profileMap = await fetchProfileNameMap(rows.map((row) => row.created_by))

  const roomIds = rows.map((row) => row.id).filter(Boolean)
  const membershipMeta = await fetchRoomMembershipMeta(roomIds, currentProfileId)

  let latestMessageMap = new Map()

  if (roomIds.length > 0) {
    const { data: messagesData, error: messagesError } = await supabase
      .from(CHAT_MESSAGES_TABLE)
      .select('id, room_id, content, is_deleted, created_at')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false })

    if (messagesError) {
      throw toError(messagesError, '최근 메시지 정보를 불러오지 못했습니다.')
    }

    latestMessageMap = new Map()
    ;(messagesData || []).forEach((row) => {
      if (!latestMessageMap.has(row.room_id)) {
        latestMessageMap.set(row.room_id, row)
      }
    })
  }

  return rows.map((row) =>
    normalizeChatRoom(row, profileMap, latestMessageMap, currentProfileId, membershipMeta),
  )
}

export async function createChatRoom(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const name = assertRoomName(payload?.name)
  const description = normalizeDescription(payload?.description)

  const { data, error } = await supabase
    .from(CHAT_ROOMS_TABLE)
    .insert({
      name,
      description,
      created_by: profile.id,
      last_message_at: null,
      is_archived: false,
    })
    .select('*')
    .single()

  if (error) {
    throw toError(error, '채팅방 생성에 실패했습니다.')
  }

  return data
}

export async function deleteChatRoom(roomId) {
  requireSupabaseConfigured()

  const safeRoomId = normalizeRoomId(roomId)
  if (!safeRoomId) {
    throw new Error('삭제할 채팅방을 찾을 수 없습니다.')
  }

  const { error } = await supabase.from(CHAT_ROOMS_TABLE).delete().eq('id', safeRoomId)

  if (error) {
    throw toError(error, '채팅방 삭제에 실패했습니다.')
  }
}

export async function joinChatRoom(roomId, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const safeRoomId = normalizeRoomId(roomId)
  if (!safeRoomId) {
    throw new Error('참여할 채팅방을 찾을 수 없습니다.')
  }

  let lastMissingColumnError = null
  const insertPayloads = buildMembershipInsertPayloads({
    roomId: safeRoomId,
    profileId: profile.id,
    role: 'member',
  })

  for (const payload of insertPayloads) {
    const { error } = await supabase.from(CHAT_ROOM_MEMBERS_TABLE).insert(payload)

    if (!error || isDuplicateMembershipError(error)) {
      return {
        roomId: safeRoomId,
      }
    }

    if (isMissingColumnError(error)) {
      lastMissingColumnError = error
      continue
    }

    throw toError(error, '채팅방 참여에 실패했습니다.')
  }

  throw toError(lastMissingColumnError, '채팅방 참여에 실패했습니다.')
}

export async function leaveChatRoom(roomId, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const safeRoomId = normalizeRoomId(roomId)
  if (!safeRoomId) {
    throw new Error('나갈 채팅방을 찾을 수 없습니다.')
  }

  let lastMissingColumnError = null

  for (const userField of MEMBERSHIP_USER_FIELD_CANDIDATES) {
    const { error } = await supabase
      .from(CHAT_ROOM_MEMBERS_TABLE)
      .delete()
      .eq('room_id', safeRoomId)
      .eq(userField, profile.id)

    if (!error) {
      return {
        roomId: safeRoomId,
      }
    }

    if (isMissingColumnError(error)) {
      lastMissingColumnError = error
      continue
    }

    throw toError(error, '채팅방 나가기에 실패했습니다.')
  }

  throw toError(lastMissingColumnError, '채팅방 나가기에 실패했습니다.')
}

export async function listChatMessages({ roomId, currentProfileId = null }) {
  requireSupabaseConfigured()

  const safeRoomId = normalizeRoomId(roomId)
  if (!safeRoomId) {
    return []
  }

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select('*')
    .eq('room_id', safeRoomId)
    .order('created_at', { ascending: true })

  if (error) {
    throw toError(error, '채팅 메시지를 불러오지 못했습니다.')
  }

  const rows = data || []
  const profileMap = await fetchProfileNameMap(rows.map((row) => row.author_id))

  return rows.map((row) => normalizeChatMessage(row, profileMap, currentProfileId))
}

export async function sendChatMessage(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const safeRoomId = normalizeRoomId(payload?.roomId)
  if (!safeRoomId) {
    throw new Error('메시지를 보낼 채팅방을 찾을 수 없습니다.')
  }

  const content = assertMessageContent(payload?.content)

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .insert({
      room_id: Math.floor(safeRoomId),
      author_id: profile.id,
      content,
      is_deleted: false,
    })
    .select('*')
    .single()

  if (error) {
    throw toError(error, '메시지 전송에 실패했습니다.')
  }

  return data
}

export async function updateChatMessage({ messageId, content }) {
  requireSupabaseConfigured()

  const safeMessageId = Number(messageId)
  if (!Number.isFinite(safeMessageId) || safeMessageId <= 0) {
    throw new Error('수정할 메시지를 찾을 수 없습니다.')
  }

  const safeContent = assertMessageContent(content)

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .update({
      content: safeContent,
      edited_at: new Date().toISOString(),
      is_deleted: false,
      deleted_at: null,
    })
    .eq('id', Math.floor(safeMessageId))
    .select('*')
    .single()

  if (error) {
    throw toError(error, '메시지 수정에 실패했습니다.')
  }

  return data
}

export async function softDeleteChatMessage(messageId) {
  requireSupabaseConfigured()

  const safeMessageId = Number(messageId)
  if (!Number.isFinite(safeMessageId) || safeMessageId <= 0) {
    throw new Error('삭제할 메시지를 찾을 수 없습니다.')
  }

  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .update({
      is_deleted: true,
      deleted_at: nowIso,
      edited_at: nowIso,
      content: '',
    })
    .eq('id', Math.floor(safeMessageId))
    .select('*')
    .single()

  if (error) {
    throw toError(error, '메시지 삭제에 실패했습니다.')
  }

  return data
}

export function subscribeChatRooms(onChange) {
  requireSupabaseConfigured()

  const channelName = `chat-rooms:${Date.now()}`
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: CHAT_ROOMS_TABLE,
      },
      (payload) => {
        onChange?.(payload)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeChatMessages({ roomId, onChange }) {
  requireSupabaseConfigured()

  const safeRoomId = normalizeRoomId(roomId)
  if (!safeRoomId) {
    return () => {}
  }

  const channelName = `chat-messages:${safeRoomId}:${Date.now()}`
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: CHAT_MESSAGES_TABLE,
        filter: `room_id=eq.${safeRoomId}`,
      },
      (payload) => {
        onChange?.(payload)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
