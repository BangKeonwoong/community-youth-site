import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const INVITE_CODES_TABLE = import.meta.env.VITE_SUPABASE_INVITE_CODES_TABLE || 'invite_codes'
const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'
const MEETUPS_TABLE = import.meta.env.VITE_SUPABASE_MEETUPS_TABLE || 'meetups'
const GRACE_TABLE = import.meta.env.VITE_SUPABASE_GRACE_TABLE || 'grace_posts'
const PRAYER_TABLE = import.meta.env.VITE_SUPABASE_PRAYER_TABLE || 'prayer_requests'
const PRAISE_TABLE = import.meta.env.VITE_SUPABASE_PRAISE_TABLE || 'praise_recommendations'

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_CODE_LENGTH = 8
const AUTO_CODE_RETRY_LIMIT = 8

function mapAdminErrorMessage(rawMessage, errorCode, fallbackMessage) {
  const message = String(rawMessage || '')

  if (message.includes('AUTH_REQUIRED')) {
    return '로그인이 필요합니다. 다시 로그인해 주세요.'
  }

  if (message.includes('ADMIN_ONLY') || errorCode === '42501') {
    return '관리자만 수행할 수 있는 작업입니다.'
  }

  if (message.includes('PROFILE_NOT_FOUND')) {
    return '대상 프로필을 찾을 수 없습니다.'
  }

  if (message.includes('LAST_ADMIN_REQUIRED')) {
    return '마지막 관리자는 해제할 수 없습니다.'
  }

  if (message.includes('INVITE_NOT_FOUND')) {
    return '초대코드를 찾을 수 없습니다.'
  }

  if (message.includes('INVITE_REVOKED')) {
    return '회수된 초대코드입니다.'
  }

  if (message.includes('INVITE_EXPIRED')) {
    return '만료된 초대코드입니다.'
  }

  if (message.includes('INVITE_USAGE_EXCEEDED') || message.includes('INVITE_ALREADY_REDEEMED')) {
    return '사용 가능 횟수가 모두 소진된 초대코드입니다.'
  }

  if (message.includes('USER_ALREADY_REDEEMED')) {
    return '이 계정은 이미 초대코드를 사용했습니다.'
  }

  if (message.includes('INVITE_EMAIL_MISMATCH')) {
    return '초대코드에 등록된 이메일과 로그인한 이메일이 다릅니다.'
  }

  if (errorCode === '23505') {
    if (message.includes('invite_codes_code_key') || message.includes('(code)')) {
      return '이미 사용 중인 초대코드입니다. 다른 코드를 입력해 주세요.'
    }

    if (message.includes('invite_code_redemptions_user_id_key')) {
      return '이 계정은 이미 초대코드를 사용했습니다.'
    }
  }

  if (errorCode === '23514') {
    if (message.includes('invite_codes_code_check')) {
      return '초대코드는 6~32자의 영문 대문자/숫자/_/- 형식이어야 합니다.'
    }

    if (message.includes('invite_codes_invited_email_check')) {
      return '초대 이메일 형식이 올바르지 않습니다.'
    }

    if (
      message.includes('invite_codes_max_uses_check') ||
      message.includes('invite_codes_used_count_check')
    ) {
      return '초대코드 사용 횟수 설정이 올바르지 않습니다.'
    }
  }

  if (errorCode === '22P02') {
    return '입력 형식이 올바르지 않습니다.'
  }

  if (errorCode === 'PGRST116') {
    return '대상 데이터를 찾을 수 없습니다.'
  }

  if (message.includes('row-level security')) {
    return '권한이 없어 요청을 처리할 수 없습니다.'
  }

  return fallbackMessage || message || '요청 처리 중 오류가 발생했습니다.'
}

function toError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  const nextError = new Error(mapAdminErrorMessage(error.message, error.code, fallbackMessage))
  nextError.code = error.code
  nextError.status = error.status
  return nextError
}

function assertAdminProfile(profile) {
  if (!profile?.id) {
    throw new Error('프로필을 확인할 수 없어 요청을 처리할 수 없습니다.')
  }

  if (profile.role && profile.role !== 'admin') {
    throw new Error('관리자만 수행할 수 있는 작업입니다.')
  }
}

function toOptionalTrimmed(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed : null
}

function toIsoOrNull(value) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function toPositiveInteger(value, defaultValue = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue
  }

  return parsed
}

function isInviteCodeFormatValid(code) {
  return /^[A-Z0-9_-]{6,32}$/.test(code)
}

function normalizeInviteCode(rawCode) {
  return String(rawCode || '').trim().toUpperCase()
}

function generateInviteCode(length = INVITE_CODE_LENGTH) {
  const chars = INVITE_CODE_ALPHABET
  const charsLength = chars.length
  const output = []

  if (globalThis.crypto?.getRandomValues) {
    const randomValues = new Uint8Array(length)
    globalThis.crypto.getRandomValues(randomValues)
    for (let index = 0; index < randomValues.length; index += 1) {
      output.push(chars[randomValues[index] % charsLength])
    }
    return output.join('')
  }

  for (let index = 0; index < length; index += 1) {
    output.push(chars[Math.floor(Math.random() * charsLength)])
  }

  return output.join('')
}

function normalizeProfileRow(row) {
  return {
    id: row.id,
    displayName: row.display_name || '이름 미상',
    isAdmin: Boolean(row.is_admin),
    role: row.is_admin ? 'admin' : 'member',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

async function fetchProfileNameMap(profileIds) {
  const ids = [...new Set((profileIds || []).filter(Boolean))]
  if (ids.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase.from(PROFILE_TABLE).select('id, display_name').in('id', ids)

  if (error) {
    throw toError(error, '작성자 정보를 불러오지 못했습니다.')
  }

  const map = new Map()
  ;(data || []).forEach((row) => {
    map.set(row.id, row.display_name || '이름 미상')
  })
  return map
}

function normalizeInviteCodeRow(row, profileMap) {
  const maxUses = Math.max(toPositiveInteger(row.max_uses, 1), 1)
  const usedCount = Math.min(Math.max(Number(row.used_count || 0), 0), maxUses)
  const isRedeemed = usedCount >= maxUses || Boolean(row.is_redeemed)

  return {
    id: row.id,
    code: row.code || '',
    invitedName: row.invited_name || '',
    invitedEmail: row.invited_email || '',
    note: row.note || '',
    expiresAt: row.expires_at || null,
    maxUses,
    usedCount,
    remainingUses: Math.max(maxUses - usedCount, 0),
    isRedeemed,
    redeemedBy: row.redeemed_by || null,
    redeemedByName: row.redeemed_by ? profileMap.get(row.redeemed_by) || '이름 미상' : null,
    redeemedAt: row.redeemed_at || null,
    revokedAt: row.revoked_at || null,
    isRevoked: Boolean(row.revoked_at),
    createdBy: row.created_by || null,
    createdByName: profileMap.get(row.created_by) || '이름 미상',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function toModerationContent(type, row) {
  if (type === 'meetup') {
    return [row.description, row.location].filter(Boolean).join(' · ')
  }

  if (type === 'praise') {
    return [row.artist, row.note, row.youtube_url].filter(Boolean).join(' · ')
  }

  return row.content || ''
}

function normalizeModerationRow(type, row, profileMap) {
  const authorId = row.author_id || row.created_by || null

  return {
    type,
    id: row.id,
    title: row.title || '제목 없음',
    content: toModerationContent(type, row),
    authorId,
    authorName: profileMap.get(authorId) || '이름 미상',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export async function listInviteCodes() {
  requireSupabaseConfigured()

  const { data, error } = await supabase
    .from(INVITE_CODES_TABLE)
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw toError(error, '초대코드 목록을 불러오지 못했습니다.')
  }

  const rows = data || []
  const profileMap = await fetchProfileNameMap(
    rows.flatMap((row) => [row.created_by, row.redeemed_by]).filter(Boolean),
  )

  return rows.map((row) => normalizeInviteCodeRow(row, profileMap))
}

async function insertInviteCode(row) {
  const { data, error } = await supabase.from(INVITE_CODES_TABLE).insert(row).select('*').single()

  if (error) {
    throw error
  }

  return data
}

export async function createInviteCode(payload, currentProfile) {
  requireSupabaseConfigured()
  assertAdminProfile(currentProfile)

  const invitedName = String(payload?.invitedName ?? payload?.invited_name ?? '').trim()
  if (!invitedName) {
    throw new Error('초대 대상 이름을 입력해 주세요.')
  }

  const maxUses = toPositiveInteger(payload?.maxUses ?? payload?.max_uses, 1)
  const insertPayload = {
    invited_name: invitedName,
    invited_email: toOptionalTrimmed(payload?.invitedEmail ?? payload?.invited_email),
    note: toOptionalTrimmed(payload?.note),
    expires_at: toIsoOrNull(payload?.expiresAt ?? payload?.expires_at),
    max_uses: maxUses,
    created_by: currentProfile.id,
  }

  const manualCode = normalizeInviteCode(payload?.code)
  if (manualCode) {
    if (!isInviteCodeFormatValid(manualCode)) {
      throw new Error('초대코드는 6~32자의 영문 대문자/숫자/_/- 형식이어야 합니다.')
    }

    try {
      const row = await insertInviteCode({ ...insertPayload, code: manualCode })
      return normalizeInviteCodeRow(row, new Map([[currentProfile.id, currentProfile.displayName || '이름 미상']]))
    } catch (error) {
      throw toError(error, '초대코드 생성에 실패했습니다.')
    }
  }

  for (let attempt = 0; attempt < AUTO_CODE_RETRY_LIMIT; attempt += 1) {
    const generatedCode = generateInviteCode()

    try {
      const row = await insertInviteCode({ ...insertPayload, code: generatedCode })
      return normalizeInviteCodeRow(row, new Map([[currentProfile.id, currentProfile.displayName || '이름 미상']]))
    } catch (error) {
      if (error?.code === '23505') {
        continue
      }

      throw toError(error, '초대코드 생성에 실패했습니다.')
    }
  }

  throw new Error('자동 초대코드 생성에 반복 실패했습니다. 잠시 후 다시 시도해 주세요.')
}

export async function revokeInviteCode(id) {
  requireSupabaseConfigured()

  const { data: existing, error: findError } = await supabase
    .from(INVITE_CODES_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (findError) {
    throw toError(findError, '초대코드를 확인하지 못했습니다.')
  }

  if (!existing) {
    throw new Error('초대코드를 찾을 수 없습니다.')
  }

  if (existing.revoked_at) {
    const profileMap = await fetchProfileNameMap([existing.created_by, existing.redeemed_by])
    return normalizeInviteCodeRow(existing, profileMap)
  }

  const { data, error } = await supabase
    .from(INVITE_CODES_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw toError(error, '초대코드 회수에 실패했습니다.')
  }

  const profileMap = await fetchProfileNameMap([data.created_by, data.redeemed_by])
  return normalizeInviteCodeRow(data, profileMap)
}

export async function listProfiles() {
  requireSupabaseConfigured()

  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select('id, display_name, is_admin, created_at, updated_at')
    .order('is_admin', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    throw toError(error, '프로필 목록을 불러오지 못했습니다.')
  }

  return (data || []).map(normalizeProfileRow)
}

export async function updateProfileAdminStatus(profileId, isAdmin) {
  requireSupabaseConfigured()

  const { data, error } = await supabase.rpc('set_profile_admin_status', {
    p_profile_id: profileId,
    p_is_admin: Boolean(isAdmin),
  })

  if (error) {
    throw toError(error, '관리자 권한 변경에 실패했습니다.')
  }

  return normalizeProfileRow(data)
}

export async function listModerationPosts() {
  requireSupabaseConfigured()

  const [meetupResult, graceResult, prayerResult, praiseResult] = await Promise.all([
    supabase
      .from(MEETUPS_TABLE)
      .select('id, title, description, location, created_by, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase
      .from(GRACE_TABLE)
      .select('id, title, content, author_id, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase
      .from(PRAYER_TABLE)
      .select('id, title, content, author_id, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase
      .from(PRAISE_TABLE)
      .select('id, title, artist, note, youtube_url, author_id, created_at, updated_at')
      .order('created_at', { ascending: false }),
  ])

  if (meetupResult.error) {
    throw toError(meetupResult.error, '벙개 글을 불러오지 못했습니다.')
  }

  if (graceResult.error) {
    throw toError(graceResult.error, '은혜 나눔 글을 불러오지 못했습니다.')
  }

  if (prayerResult.error) {
    throw toError(prayerResult.error, '기도제목 글을 불러오지 못했습니다.')
  }

  if (praiseResult.error) {
    throw toError(praiseResult.error, '찬양 추천 글을 불러오지 못했습니다.')
  }

  const meetupsRows = meetupResult.data || []
  const graceRows = graceResult.data || []
  const prayerRows = prayerResult.data || []
  const praiseRows = praiseResult.data || []

  const profileMap = await fetchProfileNameMap([
    ...meetupsRows.map((row) => row.created_by),
    ...graceRows.map((row) => row.author_id),
    ...prayerRows.map((row) => row.author_id),
    ...praiseRows.map((row) => row.author_id),
  ])

  return [
    ...meetupsRows.map((row) => normalizeModerationRow('meetup', row, profileMap)),
    ...graceRows.map((row) => normalizeModerationRow('grace', row, profileMap)),
    ...prayerRows.map((row) => normalizeModerationRow('prayer', row, profileMap)),
    ...praiseRows.map((row) => normalizeModerationRow('praise', row, profileMap)),
  ].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    return rightTime - leftTime
  })
}

function resolveModerationTable(type) {
  if (type === 'meetup' || type === 'meetups') {
    return MEETUPS_TABLE
  }

  if (type === 'grace') {
    return GRACE_TABLE
  }

  if (type === 'prayer') {
    return PRAYER_TABLE
  }

  if (type === 'praise') {
    return PRAISE_TABLE
  }

  return null
}

export async function deleteModerationPost(type, id) {
  requireSupabaseConfigured()

  const tableName = resolveModerationTable(type)
  if (!tableName) {
    throw new Error('삭제할 게시글 종류가 올바르지 않습니다.')
  }

  const { error } = await supabase.from(tableName).delete().eq('id', id)

  if (error) {
    throw toError(error, '게시글 삭제에 실패했습니다.')
  }
}
