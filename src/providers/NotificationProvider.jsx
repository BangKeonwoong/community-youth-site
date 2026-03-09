import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCurrentProfile, getSupabaseStatus } from '../features/profile/api'
import {
  deactivateWebPushSubscription,
  getDefaultNotificationSettings,
  getNotificationSettings,
  listMyJoinedRoomIds,
  upsertWebPushSubscription,
} from '../features/notifications/api'
import { listUpcomingBirthdays } from '../features/birthdays/api'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import '../styles/notifications.css'

const PROFILE_QUERY_KEY = ['profile']
const NOTIFICATION_SETTINGS_QUERY_KEY = ['notification-settings']
const MY_CHAT_ROOM_IDS_QUERY_KEY = ['chat-memberships', 'my-room-ids']

const TOAST_TTL_MS = 5000
const TOAST_MAX_COUNT = 5

const NotificationContext = createContext({
  supported: false,
  permission: 'default',
  settings: getDefaultNotificationSettings(),
})

function toSafeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function truncate(text, max = 80) {
  const value = toSafeText(text)
  if (value.length <= max) {
    return value
  }

  return `${value.slice(0, max - 1)}…`
}

function getBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }

  return window.Notification.permission
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

function playNotificationSound() {
  if (typeof window === 'undefined') {
    return
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) {
    return
  }

  try {
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gainNode = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = 880

    gainNode.gain.setValueAtTime(0.0001, context.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2)

    oscillator.connect(gainNode)
    gainNode.connect(context.destination)

    oscillator.start(context.currentTime)
    oscillator.stop(context.currentTime + 0.22)

    oscillator.onended = () => {
      context.close().catch(() => {})
    }
  } catch {
    // Ignore audio errors to avoid interrupting UX.
  }
}

function toSubscriptionPayload(subscription) {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.toJSON()?.keys?.p256dh,
      auth: subscription.toJSON()?.keys?.auth,
    },
  }
}

function NotificationProvider({ children }) {
  const supabaseStatus = useMemo(() => getSupabaseStatus(), [])
  const queryClient = useQueryClient()
  const [toasts, setToasts] = useState([])
  const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState(null)
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false)

  const toastTimersRef = useRef(new Map())
  const serviceWorkerRegistrationRef = useRef(null)

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getCurrentProfile,
    staleTime: 5 * 60 * 1000,
  })

  const profileId = profileQuery.data?.id || null
  const isRealProfile = profileQuery.data?.source === 'database'

  const settingsQuery = useQuery({
    queryKey: [...NOTIFICATION_SETTINGS_QUERY_KEY, profileId || 'anonymous'],
    queryFn: () => getNotificationSettings(profileId),
    enabled: supabaseStatus.configured && isRealProfile && Boolean(profileId),
    staleTime: 30 * 1000,
  })

  const roomMembershipQueryKey = useMemo(
    () => [...MY_CHAT_ROOM_IDS_QUERY_KEY, profileId || 'anonymous'],
    [profileId],
  )

  const roomIdsQuery = useQuery({
    queryKey: roomMembershipQueryKey,
    queryFn: () => listMyJoinedRoomIds(profileId),
    enabled: supabaseStatus.configured && isRealProfile && Boolean(profileId),
    staleTime: 30 * 1000,
  })

  const settings = settingsQuery.data || getDefaultNotificationSettings()
  const permission = getBrowserNotificationPermission()
  const joinedRoomIdSet = useMemo(() => new Set(roomIdsQuery.data || []), [roomIdsQuery.data])

  const removeToast = useCallback((toastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId))

    const timer = toastTimersRef.current.get(toastId)
    if (timer) {
      window.clearTimeout(timer)
      toastTimersRef.current.delete(toastId)
    }
  }, [])

  const addToast = useCallback(
    (toast) => {
      const nextToast = {
        id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        title: toast.title,
        body: toast.body,
        path: toast.path || '/',
      }

      setToasts((current) => {
        const sliced = [nextToast, ...current]
        return sliced.slice(0, TOAST_MAX_COUNT)
      })

      const timer = window.setTimeout(() => {
        removeToast(nextToast.id)
      }, TOAST_TTL_MS)
      toastTimersRef.current.set(nextToast.id, timer)
    },
    [removeToast],
  )

  const showBrowserNotification = useCallback((payload) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return
    }

    if (window.Notification.permission !== 'granted') {
      return
    }

    const title = payload.title
    const body = payload.body
    const path = payload.path || '/'

    if (!document.hidden) {
      return
    }

    if (serviceWorkerRegistrationRef.current?.showNotification) {
      serviceWorkerRegistrationRef.current
        .showNotification(title, {
          body,
          tag: `inapp:${path}:${Date.now()}`,
          data: { path },
          icon: `${import.meta.env.BASE_URL || '/'}vite.svg`,
        })
        .catch(() => {})
      return
    }

    const notice = new window.Notification(title, {
      body,
      tag: `inapp:${path}:${Date.now()}`,
    })

    notice.onclick = () => {
      window.focus()
      window.location.hash = path
      notice.close()
    }
  }, [])

  const dispatchNotification = useCallback(
    (payload, options = {}) => {
      if (settings.inAppEnabled) {
        addToast(payload)
      }

      if (settings.soundEnabled && options.playSound !== false) {
        playNotificationSound()
      }

      if (settings.browserEnabled && options.browser !== false) {
        showBrowserNotification(payload)
      }
    },
    [addToast, settings.browserEnabled, settings.inAppEnabled, settings.soundEnabled, showBrowserNotification],
  )

  useEffect(() => {
    if (!supabaseStatus.configured || !isSupabaseConfigured || !('serviceWorker' in navigator)) {
      return undefined
    }

    let isMounted = true

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL || '/'}sw.js`)
        if (!isMounted) {
          return
        }

        serviceWorkerRegistrationRef.current = registration
        setServiceWorkerRegistration(registration)
        setServiceWorkerReady(true)
      } catch {
        serviceWorkerRegistrationRef.current = null
        setServiceWorkerRegistration(null)
        setServiceWorkerReady(false)
      }
    }

    register()

    return () => {
      isMounted = false
    }
  }, [supabaseStatus.configured])

  useEffect(() => {
    const registration = serviceWorkerRegistration || serviceWorkerRegistrationRef.current

    if (!supabaseStatus.configured || !isRealProfile || !profileId || !registration) {
      return
    }

    const syncPushSubscription = async () => {
      const supportsPush = 'PushManager' in window
      if (!supportsPush) {
        return
      }

      const existing = await registration.pushManager.getSubscription()

      if (!settings.browserEnabled) {
        if (existing) {
          await existing.unsubscribe().catch(() => {})
          await deactivateWebPushSubscription(existing.endpoint).catch(() => {})
        }
        return
      }

      if (window.Notification.permission !== 'granted') {
        return
      }

      const vapidPublicKey = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim()
      if (!vapidPublicKey) {
        return
      }

      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }))

      await upsertWebPushSubscription(profileId, toSubscriptionPayload(subscription), navigator.userAgent || '').catch(
        () => {},
      )
    }

    syncPushSubscription().catch(() => {})
  }, [
    isRealProfile,
    profileId,
    serviceWorkerReady,
    serviceWorkerRegistration,
    settings.browserEnabled,
    supabaseStatus.configured,
  ])

  useEffect(() => {
    if (!supabaseStatus.configured || !isRealProfile || !profileId || !supabase) {
      return undefined
    }

    const channel = supabase
      .channel(`notif-chat-membership:${profileId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_room_members',
        },
        (payload) => {
          const newUserId = payload?.new?.user_id || null
          const oldUserId = payload?.old?.user_id || null

          if (newUserId !== profileId && oldUserId !== profileId) {
            return
          }

          queryClient.invalidateQueries({ queryKey: roomMembershipQueryKey, exact: true })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isRealProfile, profileId, queryClient, roomMembershipQueryKey, supabaseStatus.configured])

  useEffect(() => {
    if (!supabaseStatus.configured || !isRealProfile || !profileId || !supabase || !settings.chatEnabled) {
      return undefined
    }

    const channel = supabase
      .channel(`notif-chat:${profileId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const row = payload?.new
          if (!row?.room_id || !joinedRoomIdSet.has(row.room_id) || row.author_id === profileId) {
            return
          }

          dispatchNotification({
            title: '새 채팅 메시지',
            body: truncate(row.content || '새 메시지가 도착했습니다.', 80),
            path: '/chat',
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [dispatchNotification, isRealProfile, joinedRoomIdSet, profileId, settings.chatEnabled, supabaseStatus.configured])

  useEffect(() => {
    if (
      !supabaseStatus.configured ||
      !isRealProfile ||
      !profileId ||
      !supabase ||
      !settings.meetupEnabled ||
      !settings.scheduleEnabled
    ) {
      return undefined
    }

    const channel = supabase
      .channel(`notif-meetup:${profileId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meetups',
        },
        (payload) => {
          const row = payload?.new
          if (!row || row.created_by === profileId) {
            return
          }

          dispatchNotification({
            title: '새 벙개 일정',
            body: truncate(row.title || '새 벙개가 등록되었습니다.', 80),
            path: '/meetups',
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [
    dispatchNotification,
    isRealProfile,
    profileId,
    settings.meetupEnabled,
    settings.scheduleEnabled,
    supabaseStatus.configured,
  ])

  useEffect(() => {
    if (!supabaseStatus.configured || !isRealProfile || !profileId || !supabase || !settings.scheduleEnabled) {
      return undefined
    }

    const channel = supabase
      .channel(`notif-schedule:${profileId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_events',
        },
        (payload) => {
          const row = payload?.new
          if (!row || row.created_by === profileId) {
            return
          }

          dispatchNotification({
            title: '새 행사 일정',
            body: truncate(row.title || '새 일정이 등록되었습니다.', 80),
            path: '/schedule',
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [dispatchNotification, isRealProfile, profileId, settings.scheduleEnabled, supabaseStatus.configured])

  useEffect(() => {
    if (!supabaseStatus.configured || !isRealProfile || !profileId || !supabase) {
      return undefined
    }

    const channel = supabase
      .channel(`notif-birthday-message:${profileId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'birthday_messages',
          filter: `receiver_id=eq.${profileId}`,
        },
        (payload) => {
          const row = payload?.new
          const context = toSafeText(row?.message_context || 'birthday', 'birthday')

          if (context === 'direct') {
            if (!settings.messageEnabled) {
              return
            }

            dispatchNotification({
              title: '새 메시지',
              body: truncate(row?.content || '새 메시지가 도착했습니다.', 80),
              path: '/messages',
            })
            return
          }

          if (!settings.birthdayMessageEnabled) {
            return
          }

          dispatchNotification({
            title: '생일 축하 메시지',
            body: truncate(row?.content || '생일 메시지가 도착했습니다.', 80),
            path: '/birthdays',
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [dispatchNotification, isRealProfile, profileId, settings.birthdayMessageEnabled, settings.messageEnabled, supabaseStatus.configured])

  useEffect(() => {
    if (!supabaseStatus.configured || !isRealProfile || !profileId || !settings.birthdayDailyEnabled) {
      return undefined
    }

    const run = async () => {
      try {
        const now = new Date()
        const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
        const todayKey = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(kstNow.getUTCDate()).padStart(2, '0')}`
        const localStorageKey = `birthday-daily-toast:${profileId}:${todayKey}`

        if (window.localStorage.getItem(localStorageKey) === '1') {
          return
        }

        const rows = await listUpcomingBirthdays(1)
        const todayBirthdays = rows.filter((item) => Number(item.daysUntil) === 0)
        if (todayBirthdays.length === 0) {
          return
        }

        const firstName = todayBirthdays[0].displayName || '멤버'
        const title = '오늘 생일 알림'
        const body =
          todayBirthdays.length > 1
            ? `${firstName}님 외 ${todayBirthdays.length - 1}명의 생일입니다.`
            : `${firstName}님의 생일입니다.`

        dispatchNotification({ title, body, path: '/birthdays' }, { browser: false })
        window.localStorage.setItem(localStorageKey, '1')
      } catch {
        // Ignore daily birthday lookup failures.
      }
    }

    run()

    return undefined
  }, [dispatchNotification, isRealProfile, profileId, settings.birthdayDailyEnabled, supabaseStatus.configured])

  useEffect(() => {
    const timers = toastTimersRef.current

    return () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer)
      })
      timers.clear()
    }
  }, [])

  const contextValue = useMemo(
    () => ({
      supported: supabaseStatus.configured,
      permission,
      settings,
    }),
    [permission, settings, supabaseStatus.configured],
  )

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}

      <section className="notif-toast-root" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className="notif-toast"
            onClick={() => {
              window.location.hash = toast.path || '/'
              removeToast(toast.id)
            }}
          >
            <p className="notif-toast-title">{toast.title}</p>
            <p className="notif-toast-body">{toast.body}</p>
          </button>
        ))}
      </section>
    </NotificationContext.Provider>
  )
}

export default NotificationProvider
