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

function resolveDisplayName(user) {
  const metadataName =
    user?.user_metadata?.display_name || user?.user_metadata?.name || user?.user_metadata?.full_name

  if (metadataName && String(metadataName).trim()) {
    return String(metadataName).trim()
  }

  if (user?.email) {
    return user.email.split('@')[0]
  }

  return FALLBACK_PROFILE_NAME
}

function mapOnboardingErrorMessage(rawMessage) {
  const message = String(rawMessage || '')

  if (message.includes('BOOTSTRAP_ALREADY_COMPLETED')) {
    return '관리자 부트스트랩이 이미 끝났습니다. 초대코드로 가입을 다시 진행해 주세요.'
  }

  if (message.includes('INVITE_NOT_FOUND')) {
    return '초대코드를 찾을 수 없습니다. `/invite`에서 올바른 코드를 입력해 다시 가입해 주세요.'
  }

  if (message.includes('INVITE_ALREADY_REDEEMED')) {
    return '이미 사용된 초대코드입니다. 관리자에게 새 코드를 요청해 주세요.'
  }

  if (message.includes('INVITE_EXPIRED')) {
    return '만료된 초대코드입니다. 관리자에게 새 코드를 요청해 주세요.'
  }

  if (message.includes('INVITE_EMAIL_MISMATCH')) {
    return '초대코드에 등록된 이메일과 로그인한 이메일이 다릅니다.'
  }

  if (message.includes('USER_ALREADY_REDEEMED')) {
    return '이미 초대코드가 적용된 계정입니다. 다시 로그인해 주세요.'
  }

  if (message.includes('AUTH_REQUIRED')) {
    return '로그인 세션을 확인하지 못했습니다. 다시 로그인해 주세요.'
  }

  return ''
}

async function completeOnboardingForUser(user) {
  const inviteCode = String(user?.user_metadata?.invite_code || '').trim()
  const displayName = resolveDisplayName(user)

  if (inviteCode) {
    const { error } = await supabase.rpc('redeem_invite_code', {
      p_code: inviteCode,
      p_display_name: displayName,
    })

    if (error) {
      const mapped = mapOnboardingErrorMessage(error.message)
      if (mapped) {
        throw new Error(mapped)
      }
      throw toError(error, '초대코드 적용에 실패했습니다.')
    }

    return
  }

  const { error } = await supabase.rpc('bootstrap_owner_profile', {
    p_display_name: displayName,
  })

  if (error) {
    const mapped = mapOnboardingErrorMessage(error.message)
    if (mapped) {
      throw new Error(mapped)
    }
    throw toError(error, '관리자 부트스트랩에 실패했습니다.')
  }
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

  let profile = await getProfileByUserId(user.id)
  if (!profile) {
    await completeOnboardingForUser(user)
    profile = await getProfileByUserId(user.id)
  }

  if (!profile) {
    throw new Error('프로필 생성이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.')
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
