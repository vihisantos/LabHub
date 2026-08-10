import { defaultDb as supabase } from '../../../lib/supabase'
import { workspaceStore } from '../../../core/workspaces/store'
import { tvApi } from '../utils/apiBase'
import { localStoreGet, localStoreRemove, localStoreSet } from '../../../lib/localStore'

export interface CalendarEventItem {
  id: string
  day_part: string
  title: string
  month: number
  semester_code: string
  is_academic_calendar: boolean
}

export interface AcademicCalendarCache {
  id?: string
  semester_code: string
  source_url: string
  events: CalendarEventItem[]
  expires_at: string
  extracted_at: string
  is_active: boolean
  workspace_id?: string | null
}

const LOCAL_STORAGE_KEY = 'tv_academic_calendar_cache'

export async function fetchActiveCalendarCache(): Promise<AcademicCalendarCache | null> {
  const nowIso = new Date().toISOString()

  // 1. Tentar Supabase
  if (supabase) {
    try {
      let query = supabase
        .from('tv_calendar_cache')
        .select('*')
        .eq('is_active', true)
        .gt('expires_at', nowIso)

      const wsId = workspaceStore.activeWorkspaceId
      if (wsId) {
        query = query.eq('workspace_id', wsId)
      }

      const { data, error } = await query
        .order('extracted_at', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        const cache = data[0] as AcademicCalendarCache
        void localStoreSet(LOCAL_STORAGE_KEY, JSON.stringify(cache))
        return cache
      }
    } catch (err) {
      console.warn('[TV] Fallback local para calendário acadêmico:', err)
    }
  }

  // 2. Fallback store local com verificação estrita de expiração
  try {
    const saved = await localStoreGet(LOCAL_STORAGE_KEY)
    if (saved) {
      const cache: AcademicCalendarCache = JSON.parse(saved)
      if (cache.is_active && new Date(cache.expires_at) > new Date()) {
        return cache
      } else {
        // Expirado -> limpa cache
        void localStoreRemove(LOCAL_STORAGE_KEY)
      }
    }
  } catch {
    // ignore
  }

  return null
}

export async function saveCalendarCache(cacheData: Omit<AcademicCalendarCache, 'id' | 'extracted_at'>): Promise<AcademicCalendarCache> {
  const record: AcademicCalendarCache = {
    ...cacheData,
    workspace_id: workspaceStore.activeWorkspaceId ?? null,
    extracted_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      // Inativar anteriores (do mesmo workspace, quando houver)
      let q = supabase.from('tv_calendar_cache').update({ is_active: false } as never).eq('semester_code', cacheData.semester_code)
      if (workspaceStore.activeWorkspaceId) {
        q = q.eq('workspace_id', workspaceStore.activeWorkspaceId)
      }
      await q
      const { data, error } = await supabase.from('tv_calendar_cache').insert(record as never).select().single()
      if (!error && data) {
        void localStoreSet(LOCAL_STORAGE_KEY, JSON.stringify(data))
        return data as AcademicCalendarCache
      }
    } catch (err) {
      console.warn('[TV] Erro ao salvar cache no Supabase:', err)
    }
  }

  void localStoreSet(LOCAL_STORAGE_KEY, JSON.stringify(record))
  return record
}

export async function extractCalendarFromPdf(pdfUrl: string, semesterCode: string, endDate: string): Promise<AcademicCalendarCache> {
  const resp = await fetch(tvApi('/api/tv/calendar/extract'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: pdfUrl, semester_code: semesterCode, end_date: endDate }),
  })

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}))
    throw new Error(errData.error || `Erro na extração: HTTP ${resp.status}`)
  }

  const result = await resp.json()
  if (!result.success) {
    throw new Error(result.error || 'Falha ao extrair calendário')
  }

  const cacheRecord = await saveCalendarCache({
    semester_code: result.semester_code,
    source_url: pdfUrl,
    events: result.events,
    expires_at: result.expires_at,
    is_active: true,
  })

  return cacheRecord
}

export async function clearCalendarCache(semesterCode?: string): Promise<void> {
  if (supabase) {
    try {
      if (semesterCode) {
        await supabase.from('tv_calendar_cache').delete().eq('semester_code', semesterCode)
      } else {
        await supabase.from('tv_calendar_cache').delete().neq('id', '0')
      }
    } catch (err) {
      console.warn('[TV] Erro ao deletar cache no Supabase:', err)
    }
  }
  void localStoreRemove(LOCAL_STORAGE_KEY)
}
