/// <reference types="vite/client" />
import { precacheAndRoute } from 'workbox-precaching'

// Workbox injeta automaticamente a lista de assets para precache.
// self.__WB_MANIFEST é substituído pelo plugin durante o build.
precacheAndRoute(self.__WB_MANIFEST)

// autoUpdate (vite-plugin-pwa) requer skipWaiting + clientsClaim no SW customizado.
// Com injectManifest, o plugin NÃO injeta esses automaticamente (só no generateSW).
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/* ------------------------------------------------------------------ */
/*  Push Notifications                                                 */
/* ------------------------------------------------------------------ */

/**
 * Identidade do módulo no título, já que o SO identifica o emissor apenas como
 * o app PWA ("from LabHub" no iOS) e não oferece controle desse subtítulo.
 * O módulo explícito do servidor prevalece; URLs legadas seguem funcionando.
 */
const PUSH_MODULES: Record<string, { label: string; emoji: string }> = {
  chamados: { label: 'Chamados', emoji: '🚨' },
  reservalab: { label: 'ReservaLab', emoji: '📅' },
  stock: { label: 'Estoque', emoji: '📦' },
  'pc-care': { label: 'PC Care', emoji: '🖥️' },
  auth: { label: 'Acesso', emoji: '🔐' },
}

function pushModule(data: { module?: string; url?: string; title?: string }): string {
  const explicit = String(data.module || '').trim().toLowerCase()
  if (PUSH_MODULES[explicit]) return explicit
  const path = String(data.url || '').split('?')[0].toLowerCase()
  if (path.startsWith('/chamados') || path.startsWith('/api/chamados')) return 'chamados'
  if (path.startsWith('/reservalab') || path.startsWith('/reservas')) return 'reservalab'
  if (path.startsWith('/general-stock') || path.startsWith('/stock')) return 'stock'
  if (path.startsWith('/pc-care') || path.startsWith('/pcare')) return 'pc-care'
  const title = String(data.title || '').toLowerCase()
  if (/chamado|técnico/.test(title)) return 'chamados'
  if (/reserva|laborat[oó]rio/.test(title)) return 'reservalab'
  return ''
}

self.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() ?? {}
  const module = pushModule(data)
  const style = PUSH_MODULES[module]
  const rawTitle = String(data.title || 'LabHub')
  const title = style && !rawTitle.startsWith(style.label)
    ? `${style.emoji} ${style.label} · ${rawTitle}`
    : rawTitle
  const url = data.url || '/'
  const options: NotificationOptions = {
    body: data.body || '',
    icon: data.icon || '/logo-192.png',
    badge: data.badge || '/logo-192.png',
    vibrate: module === 'chamados' ? [250, 100, 250, 100, 350] : [200, 100, 200],
    data: { url, userId: data.userId || null },
  }

  // Antes todas tinham tag="labhub": uma notificação apagava outra, inclusive
  // de módulos diferentes. Sem tag, mensagens independentes ficam visíveis.
  // Se o backend envia uma tag por EVENTO/ONDA, renotify permite atualizar
  // apenas aquela identidade sem suprimir avisos de outros módulos/ondas.
  if (typeof data.tag === 'string' && data.tag.trim()) {
    options.tag = data.tag.slice(0, 128)
    options.renotify = true
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
