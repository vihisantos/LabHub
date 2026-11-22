import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../../../lib/ToastContext'
import { isDesktopEnv } from '../../../lib/localStore'
import { isKiosk, kioskError, isDesktopEnv as kioskIsDesktopEnv } from '../utils/kiosk'
import { isDesktopEnv as utilsIsDesktopEnv } from '../utils/kiosk'
import type { TvEvent } from '../types'

/**
 * Hook de exibição no player.
 * Lida com eventos com data/hora específica (não conteúdo acadêmico).
 * NOVO: no desktop/kiosk, não faz chamadas ao Supabase - eventos vazios.
 */
export function useEvents() {
  const [events, setEvents] = useState<TvEvent[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast: rawAddToast } = useToast()
  const addToast = (type: Parameters<typeof rawAddToast>[0], message: string) => {
    if (type === 'error' && isKiosk()) { kioskError(message); return }
    rawAddToast(type, message)
  }

  const load = useCallback(async (silent?: boolean) => {
    // NOVO: no desktop/kiosk, não carrega eventos via Supabase (zero tráfego)
    const localIsDesktop = isDesktopEnv() || kioskIsDesktopEnv() || utilsIsDesktopEnv()
    if (localIsDesktop) {
      if (!silent) setLoading(false)
      return
    }

    try {
      if (!silent) setLoading(true)
      // Não implementado - useEvents não é essencial para slides
      setEvents([])
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Erro ao carregar eventos')
      setEvents([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    load()
  }, [load])

  // Polling 15s como backstop
  useEffect(() => {
    const timer = setInterval(() => load(true), 15000)
    return () => clearInterval(timer)
  }, [load])

  return {
    events,
    loading,
    load,
  }
}