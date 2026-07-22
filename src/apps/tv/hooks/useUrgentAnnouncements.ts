import { useState, useEffect, useCallback } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'

export interface UrgentAnnouncement {
  id: string
  message: string
  severity: 'info' | 'warning' | 'danger'
  expires_at: string | null
  is_active: boolean
  created_at: string
}

const STORAGE_KEY = 'tv_urgent_announcements_local'

export function useUrgentAnnouncements() {
  const [announcements, setAnnouncements] = useState<UrgentAnnouncement[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const loadAnnouncements = useCallback(async () => {
    const nowIso = new Date().toISOString()
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('tv_urgent_announcements')
          .select('*')
          .eq('is_active', true)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('created_at', { ascending: false })

        if (!error && data) {
          setAnnouncements(data as UrgentAnnouncement[])
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
          return
        }
      } catch (err) {
        console.warn('[TV] Urgent announcements remote load failed, fallback local:', err)
      }
    }

    // Local fallback filter
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed: UrgentAnnouncement[] = JSON.parse(saved)
        const active = parsed.filter(a => a.is_active && (!a.expires_at || new Date(a.expires_at) > new Date()))
        setAnnouncements(active)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadAnnouncements()

    // Realtime subscription if available
    const db = supabase
    if (db) {
      const channel = db
        .channel('tv_urgent_announcements_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tv_urgent_announcements' }, () => {
          loadAnnouncements()
        })
        .subscribe()

      return () => {
        db.removeChannel(channel)
      }
    }
  }, [loadAnnouncements])

  const createUrgent = async (message: string, severity: 'info' | 'warning' | 'danger', durationMinutes: number | null) => {
    const expiresAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString() : null
    const newRecord: Omit<UrgentAnnouncement, 'id' | 'created_at'> = {
      message,
      severity,
      expires_at: expiresAt,
      is_active: true,
    }

    if (supabase) {
      try {
        const { error } = await supabase.from('tv_urgent_announcements').insert(newRecord as never)
        if (!error) {
          loadAnnouncements()
          return
        }
      } catch (err) {
        console.warn('[TV] Remote insert urgent failed:', err)
      }
    }

    // Fallback local
    const localItem: UrgentAnnouncement = {
      ...newRecord,
      id: 'local_' + Date.now(),
      created_at: new Date().toISOString(),
    }
    const updated = [localItem, ...announcements]
    setAnnouncements(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const dismissUrgent = async (id: string) => {
    if (supabase && !id.startsWith('local_')) {
      try {
        await supabase.from('tv_urgent_announcements').update({ is_active: false } as never).eq('id', id)
      } catch (err) {
        console.warn('[TV] Dismiss urgent failed:', err)
      }
    }
    const updated = announcements.filter(a => a.id !== id)
    setAnnouncements(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const activeAnnouncement = announcements.length > 0 ? announcements[0] : null

  return {
    announcements,
    activeAnnouncement,
    createUrgent,
    dismissUrgent,
    reload: loadAnnouncements,
  }
}
