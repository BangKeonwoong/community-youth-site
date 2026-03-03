import { supabase } from '../../lib/supabaseClient'
import { requireSupabaseConfigured } from '../profile/api'

const EVENTS_TABLE = import.meta.env.VITE_SUPABASE_EVENTS_TABLE || 'community_events'
const MEETUPS_TABLE = import.meta.env.VITE_SUPABASE_MEETUPS_TABLE || 'meetups'
const PROFILE_TABLE = import.meta.env.VITE_SUPABASE_PROFILE_TABLE || 'profiles'

const KST_OFFSET_HOURS = 9
const DAY_MS = 24 * 60 * 60 * 1000

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toDateKeyFromParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function parseDateKey(value) {
  const [year, month, day] = String(value || '')
    .split('-')
    .map((part) => Number.parseInt(part, 10))

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  return { year, month, day }
}

function compareDateKeys(a, b) {
  return String(a).localeCompare(String(b))
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isLeapYear(year) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
}

function addDaysToDateKey(dateKey, days) {
  const parsed = parseDateKey(dateKey)
  if (!parsed) {
    return null
  }

  const utcDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day) + days * DAY_MS)
  return toDateKeyFromParts(utcDate.getUTCFullYear(), utcDate.getUTCMonth() + 1, utcDate.getUTCDate())
}

function normalizeYearMonth(inputYear, inputMonth) {
  const year = Number.parseInt(String(inputYear), 10)
  const month = Number.parseInt(String(inputMonth), 10)

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new Error('연도 형식이 올바르지 않습니다.')
  }

  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error('월 형식이 올바르지 않습니다.')
  }

  return { year, month }
}

function toKstMonthRange(year, month) {
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const startUtc = new Date(Date.UTC(year, month - 1, 1, -KST_OFFSET_HOURS, 0, 0, 0))
  const endUtc = new Date(Date.UTC(nextYear, nextMonth - 1, 1, -KST_OFFSET_HOURS, 0, 0, 0))

  return {
    startUtcIso: startUtc.toISOString(),
    endUtcIso: endUtc.toISOString(),
    monthStartDateKey: toDateKeyFromParts(year, month, 1),
    monthEndDateKey: toDateKeyFromParts(year, month, daysInMonth(year, month)),
  }
}

function toKstDateKeyFromIso(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const kstDate = new Date(date.getTime() + KST_OFFSET_HOURS * 60 * 60 * 1000)
  return toDateKeyFromParts(kstDate.getUTCFullYear(), kstDate.getUTCMonth() + 1, kstDate.getUTCDate())
}

function toError(error, fallbackMessage) {
  const message = String(error?.message || '')
  const code = error?.code

  if (message.includes('ADMIN_ONLY') || code === '42501' || message.includes('row-level security')) {
    return new Error('관리자만 행사 일정을 관리할 수 있습니다.')
  }

  if (message.includes('ends_at') || message.includes('starts_at')) {
    return new Error('행사 시작/종료 일시가 올바르지 않습니다.')
  }

  if (message.includes('char_length') || message.includes('title')) {
    return new Error('행사 제목은 2자 이상 120자 이하로 입력해 주세요.')
  }

  if (code === '22P02') {
    return new Error('날짜/시간 형식이 올바르지 않습니다.')
  }

  if (code === 'PGRST116') {
    return new Error('대상 일정을 찾을 수 없습니다.')
  }

  return new Error(error?.message || fallbackMessage)
}

function assertAdminProfile(profile) {
  if (!profile?.id) {
    throw new Error('프로필을 확인할 수 없어 요청을 처리하지 못했습니다.')
  }

  if (profile.role !== 'admin') {
    throw new Error('관리자만 행사 일정을 관리할 수 있습니다.')
  }
}

function assertEventPayload(payload) {
  const title = String(payload?.title || '').trim()
  const description = String(payload?.description || '').trim()
  const location = String(payload?.location || '').trim()
  const isAllDay = Boolean(payload?.isAllDay)
  const startsAt = String(payload?.startsAt || '').trim()
  const endsAt = String(payload?.endsAt || '').trim()

  if (title.length < 2 || title.length > 120) {
    throw new Error('행사 제목은 2자 이상 120자 이하로 입력해 주세요.')
  }

  const startDate = new Date(startsAt)
  const endDate = new Date(endsAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('행사 시작/종료 일시를 정확히 입력해 주세요.')
  }

  if (endDate.getTime() < startDate.getTime()) {
    throw new Error('행사 종료 일시는 시작 일시보다 빠를 수 없습니다.')
  }

  return {
    title,
    description,
    location,
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    is_all_day: isAllDay,
  }
}

function toBirthdayDateKey(birthDate, targetYear) {
  const parsed = parseDateKey(birthDate)
  if (!parsed) {
    return null
  }

  const month = parsed.month
  let day = parsed.day

  if (month === 2 && day === 29 && !isLeapYear(targetYear)) {
    day = 28
  }

  return toDateKeyFromParts(targetYear, month, day)
}

function normalizeBirthdayRow(row, year, month) {
  const dateKey = toBirthdayDateKey(row.birth_date, year)
  if (!dateKey) {
    return null
  }

  if (!dateKey.startsWith(`${year}-${pad2(month)}-`)) {
    return null
  }

  const displayName = String(row.display_name || '').trim() || '이름 미상'

  return {
    id: `birthday:${row.id}:${dateKey}`,
    sourceType: 'birthday',
    sourceId: row.id,
    title: `${displayName} 생일`,
    description: `${displayName}님의 생일입니다.`,
    location: '',
    startsAt: null,
    endsAt: null,
    isAllDay: true,
    startDateKey: dateKey,
    endDateKey: dateKey,
    linkPath: '/birthdays',
  }
}

function normalizeMeetupRow(row) {
  const startDateKey = toKstDateKeyFromIso(row.starts_at)
  if (!startDateKey) {
    return null
  }

  const endDateKey = toKstDateKeyFromIso(row.ends_at) || startDateKey
  const safeEndDateKey = compareDateKeys(endDateKey, startDateKey) < 0 ? startDateKey : endDateKey

  return {
    id: `meetup:${row.id}`,
    sourceType: 'meetup',
    sourceId: row.id,
    title: String(row.title || '').trim() || '벙개',
    description: String(row.description || '').trim(),
    location: String(row.location || '').trim(),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || row.starts_at || null,
    isAllDay: false,
    startDateKey,
    endDateKey: safeEndDateKey,
    linkPath: '/meetups',
  }
}

function normalizeEventRow(row) {
  const startDateKey = toKstDateKeyFromIso(row.starts_at)
  const endDateKey = toKstDateKeyFromIso(row.ends_at)

  if (!startDateKey || !endDateKey) {
    return null
  }

  const safeEndDateKey = compareDateKeys(endDateKey, startDateKey) < 0 ? startDateKey : endDateKey

  return {
    id: `event:${row.id}`,
    sourceType: 'event',
    sourceId: row.id,
    title: String(row.title || '').trim() || '행사',
    description: String(row.description || '').trim(),
    location: String(row.location || '').trim(),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    isAllDay: Boolean(row.is_all_day),
    startDateKey,
    endDateKey: safeEndDateKey,
    createdBy: row.created_by || null,
    linkPath: null,
  }
}

function clampItemToMonth(item, monthStartDateKey, monthEndDateKey) {
  const startDateKey =
    compareDateKeys(item.startDateKey, monthStartDateKey) < 0 ? monthStartDateKey : item.startDateKey
  const endDateKey = compareDateKeys(item.endDateKey, monthEndDateKey) > 0 ? monthEndDateKey : item.endDateKey

  if (compareDateKeys(endDateKey, startDateKey) < 0) {
    return null
  }

  return {
    ...item,
    startDateKey,
    endDateKey,
  }
}

export async function getScheduleMonthData({ year, month }) {
  requireSupabaseConfigured()

  const normalized = normalizeYearMonth(year, month)
  const monthRange = toKstMonthRange(normalized.year, normalized.month)

  const [profilesResult, meetupsResult, eventsResult] = await Promise.all([
    supabase.from(PROFILE_TABLE).select('id, display_name, birth_date').not('birth_date', 'is', null),
    supabase
      .from(MEETUPS_TABLE)
      .select('id, title, description, location, starts_at, ends_at')
      .gte('starts_at', monthRange.startUtcIso)
      .lt('starts_at', monthRange.endUtcIso)
      .order('starts_at', { ascending: true }),
    supabase
      .from(EVENTS_TABLE)
      .select('id, title, description, location, starts_at, ends_at, is_all_day, created_by')
      .lt('starts_at', monthRange.endUtcIso)
      .gte('ends_at', monthRange.startUtcIso)
      .order('starts_at', { ascending: true }),
  ])

  if (profilesResult.error) {
    throw toError(profilesResult.error, '생일 데이터를 불러오지 못했습니다.')
  }

  if (meetupsResult.error) {
    throw toError(meetupsResult.error, '벙개 일정을 불러오지 못했습니다.')
  }

  if (eventsResult.error) {
    throw toError(eventsResult.error, '행사 일정을 불러오지 못했습니다.')
  }

  const birthdays = (profilesResult.data || [])
    .map((row) => normalizeBirthdayRow(row, normalized.year, normalized.month))
    .filter(Boolean)

  const meetups = (meetupsResult.data || [])
    .map((row) => normalizeMeetupRow(row))
    .filter(Boolean)
    .map((item) => clampItemToMonth(item, monthRange.monthStartDateKey, monthRange.monthEndDateKey))
    .filter(Boolean)

  const events = (eventsResult.data || [])
    .map((row) => normalizeEventRow(row))
    .filter(Boolean)
    .map((item) => clampItemToMonth(item, monthRange.monthStartDateKey, monthRange.monthEndDateKey))
    .filter(Boolean)

  return {
    year: normalized.year,
    month: normalized.month,
    monthStartDateKey: monthRange.monthStartDateKey,
    monthEndDateKey: monthRange.monthEndDateKey,
    birthdays,
    meetups,
    events,
  }
}

export async function createCommunityEvent(payload, profile) {
  requireSupabaseConfigured()
  assertAdminProfile(profile)

  const row = assertEventPayload(payload)

  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .insert({
      ...row,
      created_by: profile.id,
    })
    .select('id, title, description, location, starts_at, ends_at, is_all_day, created_by')
    .single()

  if (error) {
    throw toError(error, '행사 생성에 실패했습니다.')
  }

  const normalized = normalizeEventRow(data)
  if (!normalized) {
    throw new Error('생성된 행사 데이터를 정규화하지 못했습니다.')
  }

  return normalized
}

export async function updateCommunityEvent(eventId, payload, profile) {
  requireSupabaseConfigured()
  assertAdminProfile(profile)

  if (!eventId) {
    throw new Error('수정할 행사 ID가 없습니다.')
  }

  const row = assertEventPayload(payload)

  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .update(row)
    .eq('id', eventId)
    .select('id, title, description, location, starts_at, ends_at, is_all_day, created_by')
    .single()

  if (error) {
    throw toError(error, '행사 수정에 실패했습니다.')
  }

  const normalized = normalizeEventRow(data)
  if (!normalized) {
    throw new Error('수정된 행사 데이터를 정규화하지 못했습니다.')
  }

  return normalized
}

export async function deleteCommunityEvent(eventId, profile) {
  requireSupabaseConfigured()
  assertAdminProfile(profile)

  if (!eventId) {
    throw new Error('삭제할 행사 ID가 없습니다.')
  }

  const { error } = await supabase.from(EVENTS_TABLE).delete().eq('id', eventId)

  if (error) {
    throw toError(error, '행사 삭제에 실패했습니다.')
  }
}

export function getDateKeyRange(startDateKey, endDateKey) {
  if (!startDateKey || !endDateKey) {
    return []
  }

  if (compareDateKeys(endDateKey, startDateKey) < 0) {
    return []
  }

  const items = []
  let cursor = startDateKey

  while (cursor && compareDateKeys(cursor, endDateKey) <= 0) {
    items.push(cursor)
    cursor = addDaysToDateKey(cursor, 1)
  }

  return items
}
