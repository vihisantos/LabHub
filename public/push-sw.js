/*  push-sw.js  –  Service Worker de Push Notifications do LabHub
    ────────────────────────────────────────────────────────────────
    • Recebe eventos  push  e exibe notificações nativas do browser.
    • Trata clique na notificação: abre / foca a URL enviada no payload.
    • Payload esperado (JSON):
        {
          "title": "Como foi seu atendimento? ⭐",
          "body":  "O chamado #123 foi resolvido. Avalie o atendimento...",
          "url":   "/chamados-publico/feedback/<ticket-uuid>"
        }
    • Sem hard-coded de rotas internas — o backend é quem decide a URL.
*/

const DEFAULT_ICON = '/icon-192.png'
const DEFAULT_URL  = '/'

/* ── Push ─────────────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    /* Fallback: payload em texto puro */
    payload = { title: 'LabHub', body: event.data.text(), url: DEFAULT_URL }
  }

  const title = payload.title || 'LabHub'
  const options = {
    body:       payload.body || '',
    icon:       payload.icon || DEFAULT_ICON,
    badge:      payload.badge || '/icon-192.png',
    tag:        payload.tag || `labhub-${Date.now()}`,
    renotify:   true,
    data:       { url: payload.url || DEFAULT_URL },
    vibrate:    [100, 50, 100],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/* ── Notification Click ──────────────────────────────────────── */

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = (event.notification.data && event.notification.data.url) || DEFAULT_URL

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      /* Se já existe uma janela LabHub aberta, foca nela e navega */
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      /* Caso contrário, abre uma nova janela */
      return clients.openWindow(url)
    })
  )
})

/* ── Notification Close (opcional, sem lógica por enquanto) ─── */

self.addEventListener('notificationclose', () => {})
