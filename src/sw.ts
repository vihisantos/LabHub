/// <reference types="vite/client" />
import { precacheAndRoute } from 'workbox-precaching'

// Workbox injeta automaticamente a lista de assets para precache.
// self.__WB_MANIFEST é substituído pelo plugin durante o build.
precacheAndRoute(self.__WB_MANIFEST)

/* ------------------------------------------------------------------ */
/*  Push Notifications                                                 */
/* ------------------------------------------------------------------ */

self.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() ?? {}

  const title = data.title || 'LabHub'
  const options: NotificationOptions = {
    body: data.body || '',
    icon: data.icon || '/logo-192.png',
    badge: data.badge || '/logo-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/', userId: data.userId || null },
    tag: data.tag || 'labhub',
    renotify: true,
  }

  if (Array.isArray(data.actions) && data.actions.length > 0) {
    options.actions = data.actions
      .slice(0, 2)
      .map((a: { action?: string; title?: string }) => ({
        action: String(a.action || ''),
        title: String(a.title || ''),
      }))
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/* ------------------------------------------------------------------ */
/*  Notification Click — normaliza URLs antes de comparar               */
/* ------------------------------------------------------------------ */

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const data = event.notification.data || {}
  event.notification.close()

  // PR-4D-A: sem botões approve/reject na notificação (Option B). A antiga
  // chamada a /api/push/action era feita sem Authorization (sempre 401) e
  // abriria uma escrita sensível fora do app autenticado. O clique agora só
  // abre a URL informativa (ex.: /admin/users?pending=<id>); a decisão é
  // tomada dentro do app, com require_auth/require_admin.

  const rawUrl: string = data.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Normaliza o path do target
      const targetPath = rawUrl.startsWith('http')
        ? new URL(rawUrl).pathname
        : rawUrl

      for (const client of clientList) {
        // Normaliza o path do client atual
        let clientPath: string
        try {
          clientPath = new URL(client.url).pathname
        } catch {
          clientPath = client.url
        }

        if (clientPath === targetPath && 'focus' in client) {
          return (client as WindowClient).focus()
        }
      }

      // Abre nova janela se nenhum client existente combina
      return self.clients.openWindow(rawUrl)
    })
  )
})
