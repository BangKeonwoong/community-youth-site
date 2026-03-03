import { useMemo, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/common/EmptyState'
import ErrorBanner from '../components/common/ErrorBanner'
import { getDateKeyRange } from '../features/schedule/api'
import { useSchedulePage } from '../features/schedule/hooks'

const KST_OFFSET_HOURS = 9
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const MAX_CHIPS_PER_DAY = 3
const TYPE_PRIORITY = {
  event: 0,
  meetup: 1,
  birthday: 2,
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toDateKeyFromParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '')
    .split('-')
    .map((value) => Number.parseInt(value, 10))

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  return { year, month, day }
}

function compareDateKeys(a, b) {
  return String(a).localeCompare(String(b))
}

function getTodayKstParts() {
  const now = new Date()
  const kstNow = new Date(now.getTime() + KST_OFFSET_HOURS * 60 * 60 * 1000)

  return {
    year: kstNow.getUTCFullYear(),
    month: kstNow.getUTCMonth() + 1,
    day: kstNow.getUTCDate(),
  }
}

function getTodayKstDateKey() {
  const today = getTodayKstParts()
  return toDateKeyFromParts(today.year, today.month, today.day)
}

function toKstDateTimeParts(isoValue) {
  if (!isoValue) {
    return { dateKey: '', time: '' }
  }

  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) {
    return { dateKey: '', time: '' }
  }

  const kstDate = new Date(date.getTime() + KST_OFFSET_HOURS * 60 * 60 * 1000)

  return {
    dateKey: toDateKeyFromParts(kstDate.getUTCFullYear(), kstDate.getUTCMonth() + 1, kstDate.getUTCDate()),
    time: `${pad2(kstDate.getUTCHours())}:${pad2(kstDate.getUTCMinutes())}`,
  }
}

function kstDateTimeToIso(dateKey, time, { seconds = 0, milliseconds = 0 } = {}) {
  const parsed = parseDateKey(dateKey)
  if (!parsed) {
    return null
  }

  const [hourRaw, minuteRaw] = String(time || '')
    .split(':')
    .map((value) => Number.parseInt(value, 10))

  const hour = Number.isFinite(hourRaw) ? hourRaw : 0
  const minute = Number.isFinite(minuteRaw) ? minuteRaw : 0

  const utcDate = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, hour - KST_OFFSET_HOURS, minute, seconds, milliseconds),
  )

  if (Number.isNaN(utcDate.getTime())) {
    return null
  }

  return utcDate.toISOString()
}

function formatMonthTitle(year, month) {
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

function formatDateKeyLabel(dateKey) {
  const parsed = parseDateKey(dateKey)
  if (!parsed) {
    return '날짜 미정'
  }

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

function formatDateKeyShort(dateKey) {
  const parsed = parseDateKey(dateKey)
  if (!parsed) {
    return '날짜 미정'
  }

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function formatTimeRange(item) {
  if (item.sourceType === 'birthday') {
    return '종일 · 생일'
  }

  if (item.isAllDay) {
    if (item.startDateKey === item.endDateKey) {
      return '종일'
    }

    return `${formatDateKeyShort(item.startDateKey)} ~ ${formatDateKeyShort(item.endDateKey)} · 종일`
  }

  const startParts = toKstDateTimeParts(item.startsAt)
  const endParts = toKstDateTimeParts(item.endsAt)

  if (!startParts.dateKey || !endParts.dateKey) {
    return '시간 미정'
  }

  if (startParts.dateKey === endParts.dateKey) {
    return `${formatDateKeyShort(startParts.dateKey)} ${startParts.time} ~ ${endParts.time}`
  }

  return `${formatDateKeyShort(startParts.dateKey)} ${startParts.time} ~ ${formatDateKeyShort(endParts.dateKey)} ${endParts.time}`
}

function buildMonthGrid(year, month) {
  const firstDate = new Date(Date.UTC(year, month - 1, 1))
  const firstWeekday = firstDate.getUTCDay()
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstWeekday))

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getTime() + index * 24 * 60 * 60 * 1000)
    const dateKey = toDateKeyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())

    return {
      dateKey,
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() + 1 === month,
    }
  })
}

function createDefaultEventForm(dateKey) {
  return {
    title: '',
    description: '',
    location: '',
    isAllDay: true,
    startDate: dateKey,
    endDate: dateKey,
    startTime: '10:00',
    endTime: '11:00',
  }
}

function getDefaultSelectedDateForMonth(year, month) {
  const today = getTodayKstParts()

  if (today.year === year && today.month === month) {
    return toDateKeyFromParts(today.year, today.month, today.day)
  }

  return toDateKeyFromParts(year, month, 1)
}

function getTypeLabel(type) {
  if (type === 'event') {
    return '행사'
  }

  if (type === 'meetup') {
    return '벙개'
  }

  return '생일'
}

function sortItems(a, b) {
  const allDayDiff = Number(b.isAllDay) - Number(a.isAllDay)
  if (allDayDiff !== 0) {
    return allDayDiff
  }

  const aTime = a.startsAt ? toKstDateTimeParts(a.startsAt).time : '00:00'
  const bTime = b.startsAt ? toKstDateTimeParts(b.startsAt).time : '00:00'
  const timeDiff = String(aTime).localeCompare(String(bTime))
  if (timeDiff !== 0) {
    return timeDiff
  }

  const typeDiff = (TYPE_PRIORITY[a.sourceType] ?? 99) - (TYPE_PRIORITY[b.sourceType] ?? 99)
  if (typeDiff !== 0) {
    return typeDiff
  }

  return String(a.title || '').localeCompare(String(b.title || ''), 'ko-KR')
}

function buildEventPayload(form) {
  const title = String(form.title || '').trim()
  const description = String(form.description || '').trim()
  const location = String(form.location || '').trim()

  if (title.length < 2 || title.length > 120) {
    throw new Error('행사 제목은 2자 이상 120자 이하로 입력해 주세요.')
  }

  if (!form.startDate || !form.endDate) {
    throw new Error('행사 시작일/종료일을 입력해 주세요.')
  }

  if (compareDateKeys(form.endDate, form.startDate) < 0) {
    throw new Error('행사 종료일은 시작일보다 빠를 수 없습니다.')
  }

  if (form.isAllDay) {
    const startsAt = kstDateTimeToIso(form.startDate, '00:00', { seconds: 0, milliseconds: 0 })
    const endsAt = kstDateTimeToIso(form.endDate, '23:59', { seconds: 59, milliseconds: 999 })

    if (!startsAt || !endsAt) {
      throw new Error('행사 날짜 형식이 올바르지 않습니다.')
    }

    return {
      title,
      description,
      location,
      isAllDay: true,
      startsAt,
      endsAt,
    }
  }

  if (!form.startTime || !form.endTime) {
    throw new Error('시간을 포함한 행사에는 시작/종료 시간을 입력해 주세요.')
  }

  const startsAt = kstDateTimeToIso(form.startDate, form.startTime, { seconds: 0, milliseconds: 0 })
  const endsAt = kstDateTimeToIso(form.endDate, form.endTime, { seconds: 0, milliseconds: 0 })

  if (!startsAt || !endsAt) {
    throw new Error('행사 시간 형식이 올바르지 않습니다.')
  }

  if (new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error('행사 종료 일시는 시작 일시보다 빠를 수 없습니다.')
  }

  return {
    title,
    description,
    location,
    isAllDay: false,
    startsAt,
    endsAt,
  }
}

function InfoBanner({ message }) {
  return (
    <div className="glass schedule-info-banner">
      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Supabase 연결 필요</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</p>
    </div>
  )
}

function CalendarDayCell({ day, selectedDateKey, items, onItemClick, onSelectDate }) {
  const visibleItems = items.slice(0, MAX_CHIPS_PER_DAY)
  const hiddenCount = Math.max(items.length - visibleItems.length, 0)

  return (
    <div
      role="button"
      tabIndex={0}
      className={`schedule-day-cell ${
        day.inCurrentMonth ? '' : 'outside'
      } ${day.dateKey === selectedDateKey ? 'selected' : ''}`}
      onClick={() => onSelectDate(day.dateKey)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelectDate(day.dateKey)
        }
      }}
    >
      <div className="schedule-day-header">
        <span>{day.day}</span>
      </div>

      <div className="schedule-day-items">
        {visibleItems.map((item) => (
          <button
            key={`${day.dateKey}-${item.id}`}
            type="button"
            className={`schedule-chip ${item.sourceType}`}
            onClick={(event) => {
              event.stopPropagation()
              onItemClick(item, day.dateKey)
            }}
          >
            <span className="schedule-chip-type">{getTypeLabel(item.sourceType)}</span>
            <span className="schedule-chip-title">{item.title}</span>
          </button>
        ))}

        {hiddenCount > 0 ? <p className="schedule-chip-more">+{hiddenCount}개 더</p> : null}
      </div>
    </div>
  )
}

function ScheduleDetailItem({ item, selectedDateKey, isAdmin, isSubmitting, onOpenEditForm, onDeleteEvent }) {
  return (
    <article key={`${selectedDateKey}-${item.id}`} className="schedule-detail-item">
      <div className="schedule-detail-title-row">
        <span className={`schedule-type-badge ${item.sourceType}`}>{getTypeLabel(item.sourceType)}</span>
        <p style={{ fontWeight: 700 }}>{item.title}</p>
      </div>

      <p className="schedule-detail-meta">{formatTimeRange(item)}</p>
      {item.location ? <p className="schedule-detail-meta">장소: {item.location}</p> : null}
      {item.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p> : null}

      {isAdmin && item.sourceType === 'event' ? (
        <div className="schedule-detail-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onOpenEditForm(item)}
            disabled={isSubmitting}
          >
            <Pencil size={15} /> 수정
          </button>
          <button
            type="button"
            className="btn-secondary admin-danger-button"
            onClick={() => onDeleteEvent(item.sourceId)}
            disabled={isSubmitting}
          >
            <Trash2 size={15} /> 삭제
          </button>
        </div>
      ) : null}
    </article>
  )
}

function ScheduleEventForm({ form, setForm, editingEventId, isSubmitting, feedback, onSubmit, onCancel }) {
  return (
    <section className="glass schedule-form-card">
      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.7rem' }}>{editingEventId ? '행사 수정' : '행사 추가'}</h2>

      {feedback ? <ErrorBanner message={feedback} /> : null}

      <form className="schedule-event-form" onSubmit={onSubmit}>
        <div className="schedule-form-field">
          <label htmlFor="schedule-event-title">제목</label>
          <input
            id="schedule-event-title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="예: 여름 수련회"
            required
          />
        </div>

        <div className="schedule-form-field schedule-switch-field">
          <label htmlFor="schedule-event-all-day">종일 일정</label>
          <input
            id="schedule-event-all-day"
            type="checkbox"
            checked={form.isAllDay}
            onChange={(event) => setForm((prev) => ({ ...prev, isAllDay: event.target.checked }))}
          />
        </div>

        <div className="schedule-form-field">
          <label htmlFor="schedule-event-start-date">시작일</label>
          <input
            id="schedule-event-start-date"
            type="date"
            value={form.startDate}
            onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
            required
          />
        </div>

        <div className="schedule-form-field">
          <label htmlFor="schedule-event-end-date">종료일</label>
          <input
            id="schedule-event-end-date"
            type="date"
            value={form.endDate}
            onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
            required
          />
        </div>

        {!form.isAllDay ? (
          <>
            <div className="schedule-form-field">
              <label htmlFor="schedule-event-start-time">시작 시간</label>
              <input
                id="schedule-event-start-time"
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                required={!form.isAllDay}
              />
            </div>

            <div className="schedule-form-field">
              <label htmlFor="schedule-event-end-time">종료 시간</label>
              <input
                id="schedule-event-end-time"
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                required={!form.isAllDay}
              />
            </div>
          </>
        ) : null}

        <div className="schedule-form-field">
          <label htmlFor="schedule-event-location">장소</label>
          <input
            id="schedule-event-location"
            value={form.location}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
            placeholder="예: 본당 2층"
          />
        </div>

        <div className="schedule-form-field schedule-form-span-all">
          <label htmlFor="schedule-event-description">설명</label>
          <textarea
            id="schedule-event-description"
            rows={4}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="행사 안내 내용을 입력하세요"
          />
        </div>

        <div className="schedule-form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
            취소
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? '저장 중...' : editingEventId ? '수정 저장' : '행사 등록'}
          </button>
        </div>
      </form>
    </section>
  )
}

function Schedule() {
  const navigate = useNavigate()
  const today = useMemo(() => getTodayKstParts(), [])
  const [monthState, setMonthState] = useState({ year: today.year, month: today.month })
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    getDefaultSelectedDateForMonth(today.year, today.month),
  )
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState(null)
  const [form, setForm] = useState(() => createDefaultEventForm(getTodayKstDateKey()))
  const [feedback, setFeedback] = useState('')

  const {
    supabaseStatus,
    profile,
    isAdmin,
    scheduleMonth,
    isLoading,
    error,
    createEvent,
    updateEvent,
    deleteEvent,
    isSubmitting,
  } = useSchedulePage({
    year: monthState.year,
    month: monthState.month,
  })

  const monthGrid = useMemo(() => buildMonthGrid(monthState.year, monthState.month), [monthState.year, monthState.month])

  const dayItemsMap = useMemo(() => {
    const map = new Map()

    if (!scheduleMonth) {
      return map
    }

    const allItems = [...scheduleMonth.events, ...scheduleMonth.meetups, ...scheduleMonth.birthdays]

    allItems.forEach((item) => {
      const keys = getDateKeyRange(item.startDateKey, item.endDateKey)

      keys.forEach((dateKey) => {
        if (compareDateKeys(dateKey, scheduleMonth.monthStartDateKey) < 0) {
          return
        }

        if (compareDateKeys(dateKey, scheduleMonth.monthEndDateKey) > 0) {
          return
        }

        const list = map.get(dateKey) || []
        list.push(item)
        map.set(dateKey, list)
      })
    })

    map.forEach((value, key) => {
      map.set(key, [...value].sort(sortItems))
    })

    return map
  }, [scheduleMonth])

  const selectedDateItems = dayItemsMap.get(selectedDateKey) || []

  const handleOpenCreateForm = useCallback(() => {
    setFeedback('')
    setEditingEventId(null)
    setForm(createDefaultEventForm(selectedDateKey))
    setIsFormOpen(true)
  }, [selectedDateKey])

  const handleOpenEditForm = useCallback((item) => {
    const startParts = toKstDateTimeParts(item.startsAt)
    const endParts = toKstDateTimeParts(item.endsAt)

    setFeedback('')
    setEditingEventId(item.sourceId)
    setForm({
      title: item.title,
      description: item.description || '',
      location: item.location || '',
      isAllDay: Boolean(item.isAllDay),
      startDate: item.startDateKey || startParts.dateKey || selectedDateKey,
      endDate: item.endDateKey || endParts.dateKey || selectedDateKey,
      startTime: startParts.time || '10:00',
      endTime: endParts.time || '11:00',
    })
    setIsFormOpen(true)
  }, [selectedDateKey])

  const handleSubmitEvent = useCallback(async (event) => {
    event.preventDefault()
    setFeedback('')

    try {
      const payload = buildEventPayload(form)

      if (editingEventId) {
        await updateEvent({ eventId: editingEventId, payload })
        setFeedback('행사가 수정되었습니다.')
      } else {
        await createEvent(payload)
        setFeedback('행사가 등록되었습니다.')
      }

      setIsFormOpen(false)
      setEditingEventId(null)
      setForm(createDefaultEventForm(selectedDateKey))
    } catch (submitError) {
      setFeedback(submitError.message)
    }
  }, [form, editingEventId, createEvent, updateEvent, selectedDateKey])

  const handleDeleteEvent = useCallback(async (eventId) => {
    if (!window.confirm('이 행사를 삭제하시겠어요?')) {
      return
    }

    setFeedback('')

    try {
      await deleteEvent(eventId)
      setFeedback('행사가 삭제되었습니다.')

      if (editingEventId === eventId) {
        setIsFormOpen(false)
        setEditingEventId(null)
      }
    } catch (deleteError) {
      setFeedback(deleteError.message)
    }
  }, [deleteEvent, editingEventId])

  const handleCancelForm = useCallback(() => {
    setIsFormOpen(false)
    setEditingEventId(null)
    setFeedback('')
  }, [])

  const handleMoveMonth = useCallback((delta) => {
    setFeedback('')
    const cursor = new Date(Date.UTC(monthState.year, monthState.month - 1 + delta, 1))
    const nextMonth = {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
    }
    const nextDateKey = getDefaultSelectedDateForMonth(nextMonth.year, nextMonth.month)

    setMonthState(nextMonth)
    setSelectedDateKey(nextDateKey)
    setForm((prev) => ({ ...prev, startDate: nextDateKey, endDate: nextDateKey }))
  }, [monthState.year, monthState.month])

  const handleMoveToday = useCallback(() => {
    const now = getTodayKstParts()
    const todayDateKey = toDateKeyFromParts(now.year, now.month, now.day)
    setMonthState({ year: now.year, month: now.month })
    setSelectedDateKey(todayDateKey)
    setForm((prev) => ({ ...prev, startDate: todayDateKey, endDate: todayDateKey }))
    setFeedback('')
  }, [])

  const handleItemClick = useCallback((item, dateKey) => {
    setFeedback('')
    setSelectedDateKey(dateKey)

    if (item.sourceType === 'meetup') {
      navigate('/meetups')
      return
    }

    if (item.sourceType === 'birthday') {
      navigate('/birthdays')
    }
  }, [navigate])

  const handleSelectDate = useCallback((dateKey) => {
    setSelectedDateKey(dateKey)
    setFeedback('')
  }, [])

  return (
    <div className="animate-fade-in page-stack schedule-page">
      <header>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.35rem' }}>일정</h1>
        <p style={{ color: 'var(--text-secondary)' }}>생일, 행사, 벙개 일정을 월간 캘린더로 확인하세요.</p>
        {profile ? (
          <p style={{ marginTop: '0.35rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            {profile.displayName} ({profile.role})
          </p>
        ) : null}
      </header>

      {!supabaseStatus.configured ? <InfoBanner message={supabaseStatus.message} /> : null}

      <ErrorBanner message={error?.message || ''} />
      {feedback && !isFormOpen ? <ErrorBanner message={feedback} /> : null}

      <section className="glass schedule-calendar-card">
        <div className="schedule-calendar-toolbar">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <button
              type="button"
              className="btn-secondary schedule-icon-button"
              onClick={() => handleMoveMonth(-1)}
              disabled={!supabaseStatus.configured || isSubmitting}
              aria-label="이전 달"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="btn-secondary schedule-icon-button"
              onClick={() => handleMoveMonth(1)}
              disabled={!supabaseStatus.configured || isSubmitting}
              aria-label="다음 달"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleMoveToday}
              disabled={!supabaseStatus.configured || isSubmitting}
            >
              오늘
            </button>
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{formatMonthTitle(monthState.year, monthState.month)}</h2>
        </div>

        <div className="schedule-calendar-grid-head">
          {DAY_LABELS.map((label) => (
            <div key={label} className="schedule-weekday-label">
              {label}
            </div>
          ))}
        </div>

        {isLoading ? (
          <p style={{ color: 'var(--text-secondary)', padding: '1rem' }}>일정 데이터를 불러오는 중입니다...</p>
        ) : (
          <div className="schedule-calendar-grid-body">
            {monthGrid.map((day) => (
              <CalendarDayCell
                key={day.dateKey}
                day={day}
                selectedDateKey={selectedDateKey}
                items={dayItemsMap.get(day.dateKey) || []}
                onSelectDate={handleSelectDate}
                onItemClick={handleItemClick}
              />
            ))}
          </div>
        )}
      </section>

      <section className="glass schedule-detail-card">
        <div className="schedule-detail-header">
          <h2 style={{ fontSize: '1.05rem' }}>{formatDateKeyLabel(selectedDateKey)} 일정</h2>
          {isAdmin ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenCreateForm}
              disabled={!supabaseStatus.configured || isSubmitting}
            >
              행사 추가
            </button>
          ) : null}
        </div>

        {selectedDateItems.length === 0 ? (
          <EmptyState title="선택한 날짜에 일정이 없습니다." description="다른 날짜를 눌러 일정을 확인하세요." />
        ) : (
          <div className="schedule-detail-list">
            {selectedDateItems.map((item) => (
              <ScheduleDetailItem
                key={`${selectedDateKey}-${item.id}`}
                item={item}
                selectedDateKey={selectedDateKey}
                isAdmin={isAdmin}
                isSubmitting={isSubmitting}
                onOpenEditForm={handleOpenEditForm}
                onDeleteEvent={handleDeleteEvent}
              />
            ))}
          </div>
        )}
      </section>

      {isAdmin && isFormOpen ? (
        <ScheduleEventForm
          form={form}
          setForm={setForm}
          editingEventId={editingEventId}
          isSubmitting={isSubmitting}
          feedback={feedback}
          onSubmit={handleSubmitEvent}
          onCancel={handleCancelForm}
        />
      ) : null}
    </div>
  )
}

export default Schedule
