import { useEffect, useState } from 'react'
import { AuthContext } from '../hooks/useAuth'
import {
  createSupabaseNotConfiguredError,
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  supabase,
} from '../lib/supabaseClient'

const LOGIN_ID_PATTERN = /^[a-z0-9._-]{4,20}$/
const MEMBER_TYPE_SET = new Set(['pastor', 'teacher', 'student'])
const AUTH_LOGIN_DOMAIN = 'community.local'

function authUnavailableResult() {
  return { data: null, error: createSupabaseNotConfiguredError() }
}

function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeLoginId(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeMemberType(value) {
  return String(value ?? '').trim().toLowerCase()
}

function toSimpleError(message) {
  return {
    message,
  }
}

function mapAuthErrorMessage(rawMessage, hasInviteCode) {
  const message = String(rawMessage || '')

  if (message.includes('User already registered')) {
    return '이미 사용 중인 아이디입니다.'
  }

  if (message.includes('Invalid login credentials')) {
    return '아이디 또는 비밀번호가 올바르지 않습니다.'
  }

  if (message.includes('Email rate limit exceeded')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  }

  if (message.includes('BOOTSTRAP_ALREADY_COMPLETED')) {
    return '첫 관리자 생성이 이미 완료되었습니다. 이제 초대코드를 입력해야 가입할 수 있습니다.'
  }

  if (message.includes('INVITE_NOT_FOUND')) {
    return '초대코드를 찾을 수 없습니다. 코드를 다시 확인해 주세요.'
  }

  if (message.includes('INVITE_ALREADY_REDEEMED')) {
    return '이미 사용된 초대코드입니다.'
  }

  if (message.includes('INVITE_USAGE_EXCEEDED')) {
    return '사용 가능 횟수가 모두 소진된 초대코드입니다.'
  }

  if (message.includes('INVITE_EXPIRED')) {
    return '만료된 초대코드입니다.'
  }

  if (message.includes('INVITE_REVOKED')) {
    return '회수된 초대코드입니다.'
  }

  if (message.includes('USER_ALREADY_REDEEMED')) {
    return '이 계정은 이미 초대코드가 적용되었습니다.'
  }

  if (message.includes('PROFILE_INCOMPLETE')) {
    return '필수 프로필 정보가 누락되었습니다. 입력값을 확인해 주세요.'
  }

  if (message.includes('INVALID_DISPLAY_NAME')) {
    return '이름은 2자 이상 40자 이하로 입력해 주세요.'
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

  if (message.includes('INVALID_MEMBER_TYPE')) {
    return '구분 값을 확인해 주세요.'
  }

  if (message.includes('INVALID_LOGIN_ID')) {
    return '아이디 형식이 올바르지 않습니다. (영문 소문자/숫자/._-, 4~20자)'
  }

  if (
    message.includes('LOGIN_ID_ALREADY_IN_USE') ||
    message.includes('profiles_login_id_format_check') ||
    message.includes('idx_profiles_login_id_lower_unique') ||
    message.includes('(login_id)')
  ) {
    return '이미 사용 중인 아이디입니다.'
  }

  if (!hasInviteCode && message.includes('AUTH_REQUIRED')) {
    return '관리자 부트스트랩을 위해 먼저 로그인이 필요합니다.'
  }

  return message || '요청 처리 중 오류가 발생했습니다.'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState(
    isSupabaseConfigured ? '' : SUPABASE_NOT_CONFIGURED_MESSAGE,
  )

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return undefined
    }

    let isMounted = true

    const initializeAuth = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!isMounted) {
        return
      }

      if (error) {
        setAuthError(error.message)
      } else {
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setAuthError('')
      }

      setIsLoading(false)
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setIsLoading(false)

      if (event === 'SIGNED_OUT') {
        setAuthError('')
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithLoginId = async ({ loginId, password }) => {
    if (!supabase) {
      return authUnavailableResult()
    }

    const normalizedLoginId = normalizeLoginId(loginId)
    if (!normalizedLoginId || !password) {
      const message = '아이디와 비밀번호를 입력해 주세요.'
      setAuthError(message)
      return { data: null, error: toSimpleError(message) }
    }

    const { data: resolvedEmail, error: resolveError } = await supabase.rpc('resolve_login_email', {
      p_login_id: normalizedLoginId,
    })

    if (resolveError || !resolvedEmail) {
      const message = '아이디 또는 비밀번호가 올바르지 않습니다.'
      setAuthError(message)
      return {
        data: null,
        error: toSimpleError(message),
      }
    }

    const result = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    })

    if (result.error) {
      setAuthError(mapAuthErrorMessage(result.error.message, true))
    } else {
      setAuthError('')
    }

    return result
  }

  const signUpWithInvite = async ({
    inviteCode,
    loginId,
    password,
    displayName,
    birthDate,
    phoneNumber,
    gender,
    memberType,
  }) => {
    if (!supabase) {
      return authUnavailableResult()
    }

    const normalizedInviteCode = inviteCode?.trim() || ''
    const normalizedLoginId = normalizeLoginId(loginId)
    const normalizedDisplayName = displayName?.trim() || ''
    const normalizedBirthDate = birthDate?.trim() || ''
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)
    const normalizedGender = gender?.trim()?.toLowerCase() || ''
    const normalizedMemberType = normalizeMemberType(memberType)

    if (!LOGIN_ID_PATTERN.test(normalizedLoginId)) {
      const message = '아이디는 영문 소문자/숫자/._- 조합 4~20자로 입력해 주세요.'
      setAuthError(message)
      return { data: null, error: toSimpleError(message) }
    }

    if (!MEMBER_TYPE_SET.has(normalizedMemberType)) {
      const message = '구분을 선택해 주세요.'
      setAuthError(message)
      return { data: null, error: toSimpleError(message) }
    }

    const { data: existingEmail, error: resolveError } = await supabase.rpc('resolve_login_email', {
      p_login_id: normalizedLoginId,
    })

    if (resolveError) {
      const message = mapAuthErrorMessage(resolveError.message, Boolean(normalizedInviteCode))
      setAuthError(message)
      return { data: null, error: toSimpleError(message) }
    }

    if (existingEmail) {
      const message = '이미 사용 중인 아이디입니다.'
      setAuthError(message)
      return { data: null, error: toSimpleError(message) }
    }

    const signUpResult = await supabase.auth.signUp({
      email: `${normalizedLoginId}@${AUTH_LOGIN_DOMAIN}`,
      password,
      options: {
        data: {
          invite_code: normalizedInviteCode,
          login_id: normalizedLoginId,
          display_name: normalizedDisplayName,
          birth_date: normalizedBirthDate,
          phone_number: normalizedPhoneNumber,
          gender: normalizedGender,
          member_type: normalizedMemberType,
        },
      },
    })

    if (signUpResult.error) {
      setAuthError(mapAuthErrorMessage(signUpResult.error.message, Boolean(normalizedInviteCode)))
      return signUpResult
    }

    let activeSession = signUpResult.data.session
    if (!activeSession) {
      const signInResult = await supabase.auth.signInWithPassword({
        email: `${normalizedLoginId}@${AUTH_LOGIN_DOMAIN}`,
        password,
      })
      if (!signInResult.error) {
        activeSession = signInResult.data.session
      }
    }

    if (activeSession) {
      const trimmedCode = normalizedInviteCode
      const rpcName = trimmedCode ? 'redeem_invite_code' : 'bootstrap_owner_profile'
      const rpcParams = {
        p_display_name: normalizedDisplayName || null,
        p_birth_date: normalizedBirthDate || null,
        p_phone_number: normalizedPhoneNumber || null,
        p_gender: normalizedGender || null,
        p_login_id: normalizedLoginId || null,
        p_member_type: normalizedMemberType || null,
      }

      if (trimmedCode) {
        rpcParams.p_code = trimmedCode
      }

      const { error: redeemError } = await supabase.rpc(rpcName, rpcParams)

      if (redeemError) {
        const mappedMessage = mapAuthErrorMessage(redeemError.message, Boolean(trimmedCode))
        setAuthError(mappedMessage)
        return {
          data: signUpResult.data,
          error: {
            ...redeemError,
            message: mappedMessage,
          },
        }
      }

      setAuthError('')
    } else {
      setAuthError('가입은 완료되었지만 로그인 세션을 만들지 못했습니다. 잠시 후 다시 로그인해 주세요.')
    }

    return signUpResult
  }

  const signOut = async () => {
    if (!supabase) {
      return authUnavailableResult()
    }

    const result = await supabase.auth.signOut()

    if (result.error) {
      setAuthError(result.error.message)
    } else {
      setAuthError('')
    }

    return result
  }

  const value = {
    session,
    user,
    isLoading,
    isAuthenticated: Boolean(session && user),
    authError,
    isSupabaseConfigured,
    signInWithLoginId,
    signUpWithInvite,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
