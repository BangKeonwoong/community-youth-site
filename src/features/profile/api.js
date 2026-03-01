import {
  createSupabaseNotConfiguredError,
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  supabase,
} from '../../lib/supabaseClient'

const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'
const FALLBACK_PROFILE_ID = import.meta.env.VITE_DEFAULT_USER_ID || 'local-user'
const FALLBACK_PROFILE_NAME = import.meta.env.VITE_DEFAULT_USER_NAME || '게스트'

export const SUPABASE_NOT_CONFIGURED_CODE = 'SUPABASE_NOT_CONFIGURED'
function normalizeRoleFromRow(row) {
  if (!row) {
    return 'member'
  }

  if (typeof row.is_admin === 'boolean') {
    return row.is_admin ? 'admin' : 'member'
  }

  return row.role === 'admin' ? 'admin' : 'member'
}

function createFallbackProfile(source = 'fallback') {
  return {
    id: FALLBACK_PROFILE_ID,
    displayName: FALLBACK_PROFILE_NAME,
    role: 'member',
    source,
  }
}

function normalizeProfile(row, source = 'database') {
  return {
    id: row.id,
    displayName: row.display_name || FALLBACK_PROFILE_NAME,
    role: normalizeRoleFromRow(row),
    source,
  }
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

export function isConfigured() {
  return isSupabaseConfigured
}

export function getSupabaseStatus() {
  return {
    configured: isSupabaseConfigured,
    message: SUPABASE_NOT_CONFIGURED_MESSAGE,
  }
}

export async function getCurrentUserId() {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.getUser()
  if (error) {
    throw toError(error, '사용자 인증 정보를 불러오지 못했습니다.')
  }

  return data.user?.id ?? null
}

async function getProfileByUserId(userId) {
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select('id, display_name, is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw toError(error, '프로필을 불러오지 못했습니다.')
  }

  return data
}

export async function getCurrentProfile() {
  if (!isSupabaseConfigured || !supabase) {
    return createFallbackProfile('config-missing')
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) {
    throw toError(userError, '인증 사용자 확인에 실패했습니다.')
  }

  const user = userData.user
  if (!user) {
    return createFallbackProfile('unauthenticated')
  }

  const profile = await getProfileByUserId(user.id)
  if (!profile) {
    throw new Error('초대코드가 아직 적용되지 않았습니다. 관리자에게 문의해주세요.')
  }

  return normalizeProfile(profile)
}

export function canManagePost(profile, authorId) {
  if (!profile) {
    return false
  }

  if (profile.role === 'admin') {
    return true
  }

  return Boolean(profile.id && authorId && profile.id === authorId)
}

export function requireSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw createSupabaseNotConfiguredError()
  }
}
