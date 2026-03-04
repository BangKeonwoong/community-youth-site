self.addEventListener('push', (event) => {
  if (!event.data) {
    return
  }

  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: '알림', body: event.data.text() }
  }

  const title = payload.title || '알림'
  const body = payload.body || ''
  const path = typeof payload.path === 'string' && payload.path ? payload.path : '/'
  const url = payload.url || `/#${path}`

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag || `push:${Date.now()}`,
      data: {
        path,
        url,
      },
      icon: payload.icon || '/vite.svg',
      badge: payload.badge || '/vite.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification?.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {})
          return client.focus()
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }

      return null
    }),
  )
})
