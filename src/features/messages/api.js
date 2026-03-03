import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const BIRTHDAY_MESSAGES_TABLE = import.meta.env.VITE_SUPABASE_BIRTHDAY_MESSAGES_TABLE || 'birthday_messages'
const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'

function mapMessageError(error, fallbackMessage) {
  const message = String(error?.message || '')
  const code = error?.code

  if (message.includes('birthday_messages_sender_receiver_check')) {
    return '자기 자신에게는 메시지를 보낼 수 없습니다.'
  }

  if (code === '23503') {
    return '메시지를 받을 사용자를 찾지 못했습니다.'
  }

  if (message.includes('birthday_messages_content_length_check')) {
    return '메시지는 1~500자 사이로 입력해 주세요.'
  }

  if (message.includes('row-level security') || code === '42501') {
    return '권한이 없어 메시지를 보낼 수 없습니다.'
  }

  return fallbackMessage
}

function toError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  const nextError = new Error(mapMessageError(error, error.message || fallbackMessage))
  nextError.code = error.code
  nextError.status = error.status
  return nextError
}

function toScope(value) {
  return value === 'outbox' ? 'outbox' : 'inbox'
}

function normalizeName(value, fallback = '이름 미상') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeMessageRow(row) {
  return {
    id: row?.id ?? null,
    content: String(row?.content ?? row?.message ?? ''),
    senderId: row?.sender_id ?? row?.sender?.id ?? null,
    receiverId: row?.receiver_id ?? row?.receiver?.id ?? null,
    senderName: normalizeName(row?.sender?.display_name ?? row?.sender_name),
    receiverName: normalizeName(row?.receiver?.display_name ?? row?.receiver_name),
    createdAt: row?.created_at ?? row?.createdAt ?? null,
    readAt: row?.read_at ?? row?.readAt ?? null,
    isRead: Boolean(row?.read_at ?? row?.readAt),
  }
}

function normalizeRecipientRow(row) {
  return {
    id: row?.id ?? null,
    displayName: normalizeName(row?.display_name),
  }
}

function assertProfile(profile) {
  if (!profile?.id) {
    throw new Error('프로필을 확인할 수 없어 메시지를 전송할 수 없습니다.')
  }
}

function assertReceiverId(receiverId) {
  if (!receiverId) {
    throw new Error('메시지를 받을 사용자를 선택해 주세요.')
  }

  return String(receiverId)
}

function assertContent(content) {
  const value = String(content ?? '').trim()
  if (!value) {
    throw new Error('메시지 내용을 입력해 주세요.')
  }

  if (value.length > 500) {
    throw new Error('메시지는 500자 이하로 입력해 주세요.')
  }

  return value
}

async function callRpcWithCandidates(rpcName, candidates, fallbackMessage) {
  let lastError = null

  for (const params of candidates) {
    const { data, error } = await supabase.rpc(rpcName, params)
    if (!error) {
      return data
    }

    lastError = error
    const message = String(error.message || '')
    const isParameterSignatureIssue =
      error.code === 'PGRST202' ||
      message.includes('Could not find the function') ||
      message.includes('does not exist')

    if (!isParameterSignatureIssue) {
      break
    }
  }

  throw toError(lastError, fallbackMessage)
}

export async function listMessages({ scope = 'inbox', profileId, includeAll = false, isAdmin = false }) {
  requireSupabaseConfigured()

  const safeScope = toScope(scope)
  const shouldIncludeAll = Boolean(includeAll && isAdmin)

  let query = supabase
    .from(BIRTHDAY_MESSAGES_TABLE)
    .select(
      'id, content, created_at, read_at, sender_id, receiver_id, sender:sender_id(id, display_name), receiver:receiver_id(id, display_name)',
    )
    .order('created_at', { ascending: false })

  if (!shouldIncludeAll) {
    if (!profileId) {
      throw new Error('프로필을 확인할 수 없어 메시지를 불러오지 못했습니다.')
    }

    query =
      safeScope === 'outbox'
        ? query.eq('sender_id', profileId)
        : query.eq('receiver_id', profileId)
  }

  const { data, error } = await query

  if (error) {
    throw toError(error, '메시지 목록을 불러오지 못했습니다.')
  }

  return (data || []).map(normalizeMessageRow)
}

export async function listMessageRecipients({ excludeProfileId = null } = {}) {
  requireSupabaseConfigured()

  let query = supabase
    .from(PROFILE_TABLE)
    .select('id, display_name')
    .order('display_name', { ascending: true })

  if (excludeProfileId) {
    query = query.neq('id', excludeProfileId)
  }

  const { data, error } = await query

  if (error) {
    throw toError(error, '메시지 수신자 목록을 불러오지 못했습니다.')
  }

  return (data || []).map(normalizeRecipientRow)
}

export async function sendMessage(payload, profile) {
  requireSupabaseConfigured()
  assertProfile(profile)

  const receiverId = assertReceiverId(payload?.receiverId)
  const content = assertContent(payload?.content)

  if (receiverId === profile.id) {
    throw new Error('자기 자신에게는 메시지를 보낼 수 없습니다.')
  }

  const { data, error } = await supabase
    .from(BIRTHDAY_MESSAGES_TABLE)
    .insert({
      sender_id: profile.id,
      receiver_id: receiverId,
      content,
    })
    .select(
      'id, content, created_at, read_at, sender_id, receiver_id, sender:sender_id(id, display_name), receiver:receiver_id(id, display_name)',
    )
    .single()

  if (error) {
    throw toError(error, '메시지 전송에 실패했습니다.')
  }

  return normalizeMessageRow(data)
}

export async function markBirthdayMessageRead(messageId) {
  requireSupabaseConfigured()

  if (!messageId) {
    throw new Error('읽음 처리할 메시지를 찾을 수 없습니다.')
  }

  const data = await callRpcWithCandidates(
    'mark_birthday_message_read',
    [{ p_message_id: messageId }, { message_id: messageId }, { p_id: messageId }, { id: messageId }],
    '메시지 읽음 처리에 실패했습니다.',
  )

  return data
}
