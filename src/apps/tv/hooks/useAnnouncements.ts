import { useState, useEffect, useCallback } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'
import { useToast } from '../../../lib/ToastContext'
import { fetchAllAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../services/supabase'
import type { TvAnnouncement } from '../types'

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<TvAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchAllAnnouncements()
      setAnnouncements(data)
    } catch {
      addToast('error', 'Erro ao carregar avisos')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  /* Realtime */
  useEffect(() => {
    const db = supabase
    if (!db) return
    const ch = db
      .channel('tv-announcements-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tv_announcements' },
        () => load()
      )
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [load])

  /* Poll fallback */
  useEffect(() => {
    if (!supabase) return
    const timer = setInterval(() => load(), 15000)
    return () => clearInterval(timer)
  }, [load])

  const add = async (text: string) => {
    try {
      await createAnnouncement({
        text,
        is_active: true,
        sort_order: announcements.length,
      })
      await load()
      addToast('success', 'Aviso criado')
    } catch {
      addToast('error', 'Erro ao criar aviso')
    }
  }

  const edit = async (id: string, values: Partial<TvAnnouncement>) => {
    try {
      await updateAnnouncement(id, values)
      await load()
    } catch {
      addToast('error', 'Erro ao salvar aviso')
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteAnnouncement(id)
      await load()
      addToast('success', 'Aviso removido')
    } catch {
      addToast('error', 'Erro ao remover aviso')
    }
  }

  const moveUp = async (idx: number) => {
    if (idx === 0) return
    const a = announcements[idx]
    const b = announcements[idx - 1]
    await edit(a.id, { sort_order: b.sort_order })
    await edit(b.id, { sort_order: a.sort_order })
  }

  const moveDown = async (idx: number) => {
    if (idx === announcements.length - 1) return
    const a = announcements[idx]
    const b = announcements[idx + 1]
    await edit(a.id, { sort_order: b.sort_order })
    await edit(b.id, { sort_order: a.sort_order })
  }

  return { announcements, loading, refresh: load, add, edit, remove, moveUp, moveDown }
}
