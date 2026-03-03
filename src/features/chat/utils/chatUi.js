export const LONG_PRESS_DURATION_MS = 450
export const TOUCH_MOVE_CANCEL_PX = 12

export function isSubmitEnter(event) {
  return event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing
}

export function formatChatDateTime(value) {
  if (!value) {
    return '시간 미정'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '시간 미정'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function getSafeMenuPosition({
  x,
  y,
  menuWidth = 172,
  menuHeight = 108,
  margin = 8,
}) {
  if (typeof window === 'undefined') {
    return { x, y }
  }

  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)),
  }
}
