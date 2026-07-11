import { useState, useEffect, useCallback } from 'react'
import { fetchEvents, fetchAllEvents, createEvent, updateEvent, deleteEvent } from '../services/supabase'
import { defaultDb as supabase } from '../../../lib/supabase'
import { useRealtimeSubscription } from '../../../lib/useRealtimeSubscription'
import { useToast } from '../../../lib/ToastContext'
import type { TvEvent } from '../types'

export function useEvents() {
  const [events, setEvents] = useState<TvEvent[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true)
      const data = await fetchEvents()
      setEvents(data)
    } catch {
      if (!silent) addToast('error', 'Erro ao carregar eventos')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  /* ── Realtime: auto-refresh when events change ── */
  useRealtimeSubscription('tv_events', '*', () => load(true))

  /* ── Poll fallback: refresh every 15s ── */
  useEffect(() => {
    if (!supabase) return
    const timer = setInterval(() => { load(true) }, 15000)
    return () => clearInterval(timer)
  }, [load])

  return { events, loading, refresh: load }
}

export function useAllEvents() {
  const [events, setEvents] = useState<TvEvent[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchAllEvents()
      setEvents(data)
    } catch {
      addToast('error', 'Erro ao carregar eventos')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const add = async (values: Omit<TvEvent, 'id' | 'created_at'>) => {
    try {
      await createEvent(values)
      await load()
      addToast('success', 'Evento criado')
    } catch {
      addToast('error', 'Erro ao criar evento')
    }
  }

  const edit = async (id: string, values: Partial<TvEvent>) => {
    try {
      await updateEvent(id, values)
      await load()
    } catch {
      addToast('error', 'Erro ao salvar evento')
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteEvent(id)
      await load()
      addToast('success', 'Evento removido')
    } catch {
      addToast('error', 'Erro ao remover evento')
    }
  }

  return { events, loading, refresh: load, add, edit, remove }
}
