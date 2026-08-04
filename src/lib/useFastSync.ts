import { useEffect } from 'react'
import { syncSingle } from './sync'

/**
 * Sincroniza apenas as coleções informadas em intervalos curtos.
 * Complementa o useOnlineSync (30s, todas as coleções) para módulos que
 * precisam de resposta mais rápida (chamados, notificações, etc).
 */
export function useFastSync(collections: string[], intervalMs = 10000, enabled = true) {
  useEffect(() => {
    if (!enabled || collections.length === 0) return

    let cancelled = false
    let running = false

    const run = async () => {
      if (running || !navigator.onLine) return
      running = true
      try {
        for (const collection of collections) {
          if (cancelled) return
          try {
            await syncSingle(collection)
          } catch (e) {
            console.warn(`[Sync] Fast sync "${collection}" falhou:`, e)
          }
        }
      } finally {
        running = false
      }
    }

    run()
    const timer = setInterval(run, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections.join(','), intervalMs, enabled])
}
