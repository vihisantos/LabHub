import { useState, useEffect, useCallback } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'
import { workspaceStore } from '../../../core/workspaces/store'
import { localStoreGet, localStoreSet, isDesktopEnv } from '../../../lib/localStore'
import { isDesktopEnv as kioskIsDesktopEnv } from '../utils/kiosk'
import type { TvAnnouncement } from '../types'

const STORAGE_KEY = 'tv_urgent_announcements_local'

// Definir o tipo localmente para urgent announcements
interface UrgentAnnouncement extends TvAnnouncement {
  message: string
  severity: 'info' | 'warning' | 'danger'
}

// Exportar o tipo para uso externo (como em UrgentBanner.tsx)
export type { UrgentAnnouncement }

export function useUrgentAnnouncements() {
  const [announcements, setAnnouncements] = useState<UrgentAnnouncement[]>([])

  /* NOVO: no desktop/kiosk, não carrega anúncios via Supabase (zero tráfego) */
  const isDesktop = isDesktopEnv() || kioskIsDesktopEnv()

  const loadAnnouncements = useCallback(async () => {
    // NOVO: no kiosk, não carrega do Supabase
    if (isDesktop) {
      // Mantém arrays vazios - sem tráfego ao Supabase
      setAnnouncements([])
      return
    }

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
          const scoped = workspaceStore.filter((data as UrgentAnnouncement[]))
          setAnnouncements(scoped)
          void localStoreSet(STORAGE_KEY, JSON.stringify(scoped))
          return
        }
      } catch (err) {
        console.warn('[TV] Urgent announcements remote load failed, fallback local:', err)
      }
    }

    // Local fallback filter (só usado no web)
    if (!isDesktop) {
      try {
        const saved = await localStoreGet(STORAGE_KEY)
        if (saved) {
          const parsed: UrgentAnnouncement[] = JSON.parse(saved)
          const active = parsed.filter((a: any) => a.is_active && (!a.expires_at || new Date(a.expires_at) > new Date()))
          setAnnouncements(active)
        }
      } catch {
        // ignore
      }
    }
  }, [isDesktop])

  useEffect(() => { loadAnnouncements() }, [loadAnnouncements])

  /* Realtime subscription only in web */
  useEffect(() => {
    if (!isDesktop) {
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
    }
  }, [loadAnnouncements, isDesktop])

  const createUrgent = async (message: string, durationMinutes: number | null) => {
    const ws = workspaceStore.activeWorkspaceId
    if (!ws) throw new Error('Workspace não selecionado')

    const expiresAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString() : null
    const newRecord = {
      id: '',
      text: message,
      severity: 'info' as const,
      is_active: true,
      sort_order: 0,
      expires_at: expiresAt,
      workspace_id: ws,
      created_at: '',
    } as UrgentAnnouncement

    if (supabase) {
      try {
        await supabase.from('tv_urgent_announcements').insert(newRecord)
        loadAnnouncements()
        return
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
    void localStoreSet(STORAGE_KEY, JSON.stringify(updated))
  }

  const dismissUrgent = async (id: string) => {
    if (supabase && !id.startsWith('local_')) {
      try {
        await supabase.from('tv_urgent_announcements').update({ is_active: false }).eq('id', id)
      } catch (err) {
        console.warn('[TV] Dismiss urgent failed:', err)
      }
    }
    const updated = announcements.filter((a: any) => a.id !== id)
    setAnnouncements(updated)
    void localStoreSet(STORAGE_KEY, JSON.stringify(updated))
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