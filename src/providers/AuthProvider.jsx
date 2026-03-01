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
      setAuthError(result.error.message)
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
      setAuthError(signUpResult.error.message)
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
      const { error: redeemError } = await supabase.rpc('redeem_invite_code', {
        p_code: inviteCode,
        p_display_name: displayName || null,
      })

      if (redeemError) {
        setAuthError(redeemError.message)
        return { data: signUpResult.data, error: redeemError }
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
