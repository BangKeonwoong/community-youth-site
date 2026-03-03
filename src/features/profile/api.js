import {
  createSupabaseNotConfiguredError,
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  supabase,
} from '../../lib/supabaseClient'

const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'
const FALLBACK_PROFILE_ID = import.meta.env.VITE_DEFAULT_USER_ID || 'local-user'
const FALLBACK_PROFILE_NAME = import.meta.env.VITE_DEFAULT_USER_NAME || '게스트'
const VALID_PROFILE_GENDERS = new Set(['male', 'female'])
const KR_MOBILE_PATTERN = /^01[016789][0-9]{7,8}$/

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
    birthDate: '',
    phoneNumber: '',
    gender: '',
    role: 'member',
    source,
  }
}

function toTrimmedOrEmpty(value) {
  return String(value ?? '').trim()
}

function toIsoDateOrEmpty(value) {
  const raw = toTrimmedOrEmpty(value)
  if (!raw) {
    return ''
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString().slice(0, 10)
}

function normalizeGender(value) {
  const normalized = toTrimmedOrEmpty(value).toLowerCase()
  return VALID_PROFILE_GENDERS.has(normalized) ? normalized : ''
}

function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeProfile(row, source = 'database') {
  return {
    id: row.id,
    displayName: toTrimmedOrEmpty(row.display_name || FALLBACK_PROFILE_NAME),
    birthDate: toIsoDateOrEmpty(row.birth_date || row.birthDate),
    phoneNumber: toTrimmedOrEmpty(row.phone_number || row.phoneNumber),
    gender: normalizeGender(row.gender),
    role: normalizeRoleFromRow(row),
    source,
  }
}

function assertDisplayName(displayName) {
  const value = toTrimmedOrEmpty(displayName)
  if (!value) {
    throw new Error('이름을 입력해 주세요.')
  }

  if (value.length < 2 || value.length > 40) {
    throw new Error('이름은 2자 이상 40자 이하로 입력해 주세요.')
  }

  return value
}

function assertBirthDate(birthDate) {
  const value = toIsoDateOrEmpty(birthDate)
  if (!value) {
    throw new Error('생년월일을 입력해 주세요.')
  }

  return value
}

function assertPhoneNumber(phoneNumber) {
  const value = normalizePhoneNumber(phoneNumber)
  if (!value) {
    throw new Error('연락처를 입력해 주세요.')
  }

  if (!KR_MOBILE_PATTERN.test(value)) {
    throw new Error('휴대폰 번호 형식이 올바르지 않습니다.')
  }

  return value
}

function assertGender(gender) {
  const value = normalizeGender(gender)
  if (!value) {
    throw new Error('성별을 선택해 주세요.')
  }

  return value
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

  if (message.includes('INVITE_USAGE_EXCEEDED')) {
    return '사용 가능 횟수가 모두 소진된 초대코드입니다. 관리자에게 새 코드를 요청해 주세요.'
  }

  if (message.includes('INVITE_EXPIRED')) {
    return '만료된 초대코드입니다. 관리자에게 새 코드를 요청해 주세요.'
  }

  if (message.includes('INVITE_REVOKED')) {
    return '회수된 초대코드입니다. 관리자에게 새 코드를 요청해 주세요.'
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

  if (message.includes('PROFILE_INCOMPLETE')) {
    return '필수 프로필 정보가 누락되었습니다. 이름, 생년월일, 휴대폰 번호, 성별을 확인해 주세요.'
  }

  if (message.includes('INVALID_DISPLAY_NAME')) {
    return '표시 이름은 2자 이상 40자 이하로 입력해 주세요.'
  }

  if (message.includes('INVALID_BIRTH_DATE')) {
    return '생년월일이 올바르지 않습니다. 오늘 이전(또는 오늘) 날짜를 입력해 주세요.'
  }

  if (message.includes('INVALID_PHONE_NUMBER')) {
    return '휴대폰 번호 형식이 올바르지 않습니다.'
  }

  if (message.includes('INVALID_GENDER')) {
    return '성별 값이 올바르지 않습니다.'
  }

  return ''
}

async function completeOnboardingForUser(user) {
  const inviteCode = String(user?.user_metadata?.invite_code || '').trim()
  const displayName = resolveDisplayName(user)
  const birthDate = toIsoDateOrEmpty(user?.user_metadata?.birth_date)
  const phoneNumber = normalizePhoneNumber(user?.user_metadata?.phone_number)
  const gender = normalizeGender(user?.user_metadata?.gender)

  if (inviteCode) {
    const { error } = await supabase.rpc('redeem_invite_code', {
      p_code: inviteCode,
      p_display_name: displayName,
      p_birth_date: birthDate || null,
      p_phone_number: phoneNumber || null,
      p_gender: gender || null,
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
    p_birth_date: birthDate || null,
    p_phone_number: phoneNumber || null,
    p_gender: gender || null,
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
    .select('id, display_name, birth_date, phone_number, gender, is_admin')
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

export function isProfileComplete(profile) {
  if (!profile) {
    return false
  }

  if (profile.source === 'config-missing') {
    return true
  }

  const displayName = toTrimmedOrEmpty(profile.displayName)
  const birthDate = toIsoDateOrEmpty(profile.birthDate)
  const phoneNumber = normalizePhoneNumber(profile.phoneNumber)
  const gender = normalizeGender(profile.gender)

  return Boolean(displayName && birthDate && phoneNumber && KR_MOBILE_PATTERN.test(phoneNumber) && gender)
}

export async function updateCurrentProfileDetails(payload) {
  requireSupabaseConfigured()

  const displayName = assertDisplayName(payload?.displayName)
  const birthDate = assertBirthDate(payload?.birthDate)
  const phoneNumber = assertPhoneNumber(payload?.phoneNumber)
  const gender = assertGender(payload?.gender)

  const { data, error } = await supabase.rpc('upsert_profile_details', {
    p_display_name: displayName,
    p_birth_date: birthDate,
    p_phone_number: phoneNumber,
    p_gender: gender,
  })

  if (error) {
    const mapped = mapOnboardingErrorMessage(error.message)
    if (mapped) {
      throw new Error(mapped)
    }

    throw toError(error, '프로필 저장에 실패했습니다.')
  }

  return normalizeProfile(data)
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
