import { useEffect, useState } from 'react'
import { AuthContext } from '../hooks/useAuth'
import {
  createSupabaseNotConfiguredError,
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  supabase,
} from '../lib/supabaseClient'

function authUnavailableResult() {
  return { data: null, error: createSupabaseNotConfiguredError() }
}

function mapAuthErrorMessage(rawMessage, hasInviteCode) {
  const message = String(rawMessage || '')

  if (message.includes('User already registered')) {
    return '이미 가입된 이메일입니다. 로그인 화면에서 로그인해 주세요.'
  }

  if (message.includes('Email rate limit exceeded')) {
    return '이메일 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
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

  if (message.includes('INVITE_EMAIL_MISMATCH')) {
    return '초대코드에 등록된 이메일과 입력한 이메일이 일치하지 않습니다.'
  }

  if (message.includes('USER_ALREADY_REDEEMED')) {
    return '이 계정은 이미 초대코드가 적용되었습니다.'
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

  const signInWithEmail = async ({ email, password }) => {
    if (!supabase) {
      return authUnavailableResult()
    }

    const result = await supabase.auth.signInWithPassword({ email, password })

    if (result.error) {
      setAuthError(mapAuthErrorMessage(result.error.message, true))
    } else {
      setAuthError('')
    }

    return result
  }

  const signUpWithInvite = async ({ inviteCode, email, password, displayName }) => {
    if (!supabase) {
      return authUnavailableResult()
    }

    const signUpResult = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          invite_code: inviteCode,
          display_name: displayName || '',
        },
      },
    })

    if (signUpResult.error) {
      setAuthError(mapAuthErrorMessage(signUpResult.error.message, Boolean(inviteCode?.trim())))
      return signUpResult
    }

    let activeSession = signUpResult.data.session
    if (!activeSession) {
      const signInResult = await supabase.auth.signInWithPassword({ email, password })
      if (!signInResult.error) {
        activeSession = signInResult.data.session
      }
    }

    if (activeSession) {
      const trimmedCode = inviteCode?.trim()
      const rpcName = trimmedCode ? 'redeem_invite_code' : 'bootstrap_owner_profile'
      const rpcParams = trimmedCode
        ? { p_code: trimmedCode, p_display_name: displayName || null }
        : { p_display_name: displayName || null }

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
      setAuthError('이메일 인증이 완료된 뒤 로그인하면 초대코드가 적용됩니다.')
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
    signInWithEmail,
    signUpWithInvite,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
