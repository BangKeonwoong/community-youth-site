import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

function toError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  const nextError = new Error(error.message || fallbackMessage)
  nextError.code = error.code
  nextError.status = error.status
  return nextError
}

function toPositiveInteger(value, defaultValue = 7) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue
  }

  return parsed
}

function toIsoDateOrNull(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString().slice(0, 10)
}

function toNonNegativeInteger(value, defaultValue = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue
  }

  return Math.floor(parsed)
}

function normalizeBirthdayRow(row) {
  return {
    profileId: row?.profile_id ?? row?.id ?? row?.user_id ?? row?.member_id ?? null,
    displayName: row?.display_name || row?.name || row?.profile_name || '이름 미상',
    birthDate: toIsoDateOrNull(row?.birth_date ?? row?.birthDate ?? row?.birthday),
    nextBirthdayAt: row?.next_birthday ?? row?.nextBirthday ?? null,
    daysUntil: toNonNegativeInteger(row?.days_until ?? row?.daysUntil ?? row?.days_left, 0),
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

export async function listUpcomingBirthdays(days = 7) {
  requireSupabaseConfigured()

  const safeDays = toPositiveInteger(days, 7)
  const data =
    (await callRpcWithCandidates(
      'list_upcoming_birthdays',
      [{ p_days: safeDays }, { days: safeDays }, {}],
      '다가오는 생일 목록을 불러오지 못했습니다.',
    )) || []

  return data.map(normalizeBirthdayRow)
}

export async function sendBirthdayMessage(receiverId, content) {
  requireSupabaseConfigured()

  const trimmedContent = String(content ?? '').trim()
  if (!receiverId) {
    throw new Error('메시지 받을 대상을 선택해 주세요.')
  }

  if (!trimmedContent) {
    throw new Error('메시지 내용을 입력해 주세요.')
  }

  const data = await callRpcWithCandidates(
    'send_birthday_message',
    [
      { p_receiver_id: receiverId, p_content: trimmedContent },
      { receiver_id: receiverId, content: trimmedContent },
      { p_receiver_id: receiverId, p_message: trimmedContent },
      { receiverId, content: trimmedContent },
    ],
    '생일 메시지 전송에 실패했습니다.',
  )

  return data
}
