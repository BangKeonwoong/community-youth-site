import { createClient } from '@supabase/supabase-js'

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  'Supabase 환경변수가 설정되지 않았습니다. `.env`에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 추가해주세요.'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function createSupabaseNotConfiguredError() {
  const error = new Error(SUPABASE_NOT_CONFIGURED_MESSAGE)
  error.code = 'SUPABASE_NOT_CONFIGURED'
  return error
}

export function getSupabaseClientOrThrow() {
  if (!supabase) {
    throw createSupabaseNotConfiguredError()
  }

  return supabase
}
