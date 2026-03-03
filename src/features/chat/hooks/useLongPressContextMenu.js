import { useCallback, useEffect, useRef } from 'react'
import { LONG_PRESS_DURATION_MS, TOUCH_MOVE_CANCEL_PX } from '../utils/chatUi'

export function useLongPressContextMenu(onLongPress) {
  const timerRef = useRef(null)
  const startPointRef = useRef({ x: 0, y: 0 })

  const clearLongPressTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      clearLongPressTimer()
    },
    [clearLongPressTimer],
  )

  const onTouchStart = useCallback(
    (event, payload, enabled) => {
      if (!enabled) {
        clearLongPressTimer()
        return
      }

      if (event.touches.length !== 1) {
        clearLongPressTimer()
        return
      }

      const touch = event.touches[0]
      startPointRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      }

      clearLongPressTimer()
      timerRef.current = setTimeout(() => {
        onLongPress?.({
          payload,
          x: touch.clientX,
          y: touch.clientY,
        })
        clearLongPressTimer()
      }, LONG_PRESS_DURATION_MS)
    },
    [clearLongPressTimer, onLongPress],
  )

  const onTouchMove = useCallback(
    (event) => {
      if (!timerRef.current || event.touches.length !== 1) {
        return
      }

      const touch = event.touches[0]
      const movedX = Math.abs(touch.clientX - startPointRef.current.x)
      const movedY = Math.abs(touch.clientY - startPointRef.current.y)
      if (movedX > TOUCH_MOVE_CANCEL_PX || movedY > TOUCH_MOVE_CANCEL_PX) {
        clearLongPressTimer()
      }
    },
    [clearLongPressTimer],
  )

  const onTouchEnd = useCallback(() => {
    clearLongPressTimer()
  }, [clearLongPressTimer])

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
  }
}
