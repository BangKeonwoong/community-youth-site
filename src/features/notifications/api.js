import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const SETTINGS_TABLE = import.meta.env.VITE_SUPABASE_NOTIFICATION_SETTINGS_TABLE || 'profile_notification_settings'
const SUBSCRIPTIONS_TABLE = import.meta.env.VITE_SUPABASE_WEB_PUSH_SUBSCRIPTIONS_TABLE || 'web_push_subscriptions'
const CHAT_MEMBERS_TABLE = import.meta.env.VITE_SUPABASE_CHAT_MEMBERS_TABLE || 'chat_room_members'

const DEFAULT_SETTINGS = {
  inAppEnabled: true,
  browserEnabled: true,
  soundEnabled: true,
  scheduleEnabled: true,
  meetupEnabled: true,
  chatEnabled: true,
  messageEnabled: true,
  birthdayDailyEnabled: true,
  birthdayMessageEnabled: true,
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

function toBoolean(value, fallback = true) {
  if (typeof value === 'boolean') {
    return value
  }

  return fallback
}

function normalizeSettingsRow(row) {
  if (!row || typeof row !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  return {
    inAppEnabled: toBoolean(row.in_app_enabled, true),
    browserEnabled: toBoolean(row.browser_enabled, true),
    soundEnabled: toBoolean(row.sound_enabled, true),
    scheduleEnabled: toBoolean(row.schedule_enabled, true),
    meetupEnabled: toBoolean(row.meetup_enabled, true),
    chatEnabled: toBoolean(row.chat_enabled, true),
    messageEnabled: toBoolean(row.message_enabled, true),
    birthdayDailyEnabled: toBoolean(row.birthday_daily_enabled, true),
    birthdayMessageEnabled: toBoolean(row.birthday_message_enabled, true),
  }
}

function toSettingsRow(profileId, patch = {}) {
  return {
    profile_id: profileId,
    in_app_enabled: toBoolean(patch.inAppEnabled, true),
    browser_enabled: toBoolean(patch.browserEnabled, true),
    sound_enabled: toBoolean(patch.soundEnabled, true),
    schedule_enabled: toBoolean(patch.scheduleEnabled, true),
    meetup_enabled: toBoolean(patch.meetupEnabled, true),
    chat_enabled: toBoolean(patch.chatEnabled, true),
    message_enabled: toBoolean(patch.messageEnabled, true),
    birthday_daily_enabled: toBoolean(patch.birthdayDailyEnabled, true),
    birthday_message_enabled: toBoolean(patch.birthdayMessageEnabled, true),
  }
}

async function ensureSettingsWithRpc(profileId) {
  const candidates = [
    { p_profile: profileId },
    { p_profile_id: profileId },
    { profile_id: profileId },
    { p_user_id: profileId },
    { user_id: profileId },
  ]

  let lastError = null
  let hasSignatureIssue = false

  for (const params of candidates) {
    const { data, error } = await supabase.rpc('ensure_profile_notification_settings', params)
    if (!error) {
      return normalizeSettingsRow(data)
    }

    lastError = error
    const message = String(error.message || '')
    const isSignatureIssue =
      error.code === 'PGRST202' ||
      message.includes('Could not find the function') ||
      message.includes('does not exist')

    if (isSignatureIssue) {
      hasSignatureIssue = true
      continue
    }

    throw toError(error, '알림 설정을 확인하지 못했습니다.')
  }

  if (hasSignatureIssue) {
    return null
  }

  if (lastError) {
    throw toError(lastError, '알림 설정을 확인하지 못했습니다.')
  }

  return null
}

async function fallbackEnsureSettings(profileId) {
  const { data: existing, error: selectError } = await supabase
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (selectError) {
    throw toError(selectError, '알림 설정을 불러오지 못했습니다.')
  }

  if (existing) {
    return normalizeSettingsRow(existing)
  }

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .insert(toSettingsRow(profileId, DEFAULT_SETTINGS))
    .select('*')
    .single()

  if (error) {
    throw toError(error, '알림 설정을 생성하지 못했습니다.')
  }

  return normalizeSettingsRow(data)
}

export async function getNotificationSettings(profileId) {
  requireSupabaseConfigured()

  if (!profileId) {
    throw new Error('프로필 정보를 확인하지 못했습니다.')
  }

  try {
    const ensured = await ensureSettingsWithRpc(profileId)
    if (ensured) {
      return ensured
    }
  } catch {
    // Fall through to table-based fallback path.
  }

  return fallbackEnsureSettings(profileId)
}

export async function updateNotificationSettings(profileId, patch) {
  requireSupabaseConfigured()

  if (!profileId) {
    throw new Error('프로필 정보를 확인하지 못했습니다.')
  }

  const row = toSettingsRow(profileId, patch)

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .upsert(row, { onConflict: 'profile_id' })
    .select('*')
    .single()

  if (error) {
    throw toError(error, '알림 설정 저장에 실패했습니다.')
  }

  return normalizeSettingsRow(data)
}

export async function listMyJoinedRoomIds(profileId) {
  requireSupabaseConfigured()

  if (!profileId) {
    return []
  }

  const { data, error } = await supabase
    .from(CHAT_MEMBERS_TABLE)
    .select('room_id')
    .eq('user_id', profileId)

  if (error) {
    throw toError(error, '채팅방 소속 정보를 불러오지 못했습니다.')
  }

  return [...new Set((data || []).map((row) => row.room_id).filter(Boolean))]
}

function normalizeSubscription(subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('브라우저 푸시 구독 정보가 올바르지 않습니다.')
  }

  return {
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }
}

export async function upsertWebPushSubscription(profileId, subscription, userAgent = '') {
  requireSupabaseConfigured()

  if (!profileId) {
    throw new Error('프로필 정보를 확인하지 못했습니다.')
  }

  const normalized = normalizeSubscription(subscription)

  const { error } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .upsert(
      {
        profile_id: profileId,
        endpoint: normalized.endpoint,
        p256dh: normalized.p256dh,
        auth: normalized.auth,
        user_agent: String(userAgent || '').slice(0, 400),
        is_active: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    throw toError(error, '푸시 구독 저장에 실패했습니다.')
  }
}

export async function deactivateWebPushSubscription(endpoint) {
  requireSupabaseConfigured()

  if (!endpoint) {
    return
  }

  const { error } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('endpoint', endpoint)

  if (error) {
    throw toError(error, '푸시 구독 해제 상태 저장에 실패했습니다.')
  }
}

export function getDefaultNotificationSettings() {
  return { ...DEFAULT_SETTINGS }
}
