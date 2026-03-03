import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSafeMenuPosition } from '../utils/chatUi'

const CLOSED_MENU = {
  open: false,
  messageId: null,
  x: 0,
  y: 0,
}

export function useMessageActionMenu(messages) {
  const [menu, setMenu] = useState(CLOSED_MENU)
  const menuRef = useRef(null)

  const closeMenu = useCallback(() => {
    setMenu(CLOSED_MENU)
  }, [])

  const openMenu = useCallback(({ messageId, x, y }) => {
    const safePosition = getSafeMenuPosition({ x, y })
    setMenu({
      open: true,
      messageId,
      x: safePosition.x,
      y: safePosition.y,
    })
  }, [])

  const selectedMessage = useMemo(
    () => messages.find((message) => message.id === menu.messageId) || null,
    [menu.messageId, messages],
  )

  useEffect(() => {
    if (!menu.open) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!menuRef.current || !menuRef.current.contains(event.target)) {
        closeMenu()
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeMenu, menu.open])

  return {
    menu,
    menuRef,
    selectedMessage,
    openMenu,
    closeMenu,
  }
}
