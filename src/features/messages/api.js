import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const BIRTHDAY_MESSAGES_TABLE = import.meta.env.VITE_SUPABASE_BIRTHDAY_MESSAGES_TABLE || 'birthday_messages'

function toError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  const nextError = new Error(error.message || fallbackMessage)
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
