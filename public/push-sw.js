self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}

  const title = data.title || 'LabHub'
  const options = {
    body: data.body || '',
    icon: data.icon || '/logo-192.png',
    badge: data.badge || '/logo-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/', userId: data.userId || null },
    tag: data.tag || 'labhub',
    renotify: true,
  }

  // Botões de ação (Web Push suporta até 2 — Android Chrome / desktop)
  if (Array.isArray(data.actions) && data.actions.length > 0) {
    options.actions = data.actions
      .slice(0, 2)
      .map((a) => ({ action: String(a.action || ''), title: String(a.title || '') }))
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  const action = event.action
  const data = event.notification.data || {}
  event.notification.close()

  // Aprovar / Recusar direto pela notificação
  if (action === 'approve' || action === 'reject') {
    if (data.userId) {
      event.waitUntil(
        fetch('/api/push/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, userId: data.userId }),
        }).catch(() => {})
      )
    }
    return
  }

  const url = data.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
