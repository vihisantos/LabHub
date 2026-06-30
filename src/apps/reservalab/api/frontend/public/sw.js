self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  self.registration.showNotification(data.title || 'Reservas Lab', {
    body: data.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
