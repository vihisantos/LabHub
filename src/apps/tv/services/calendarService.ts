import { defaultDb as supabase } from '../../../lib/supabase'

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
}

const LOCAL_STORAGE_KEY = 'tv_academic_calendar_cache'

export async function fetchActiveCalendarCache(): Promise<AcademicCalendarCache | null> {
  const nowIso = new Date().toISOString()

  // 1. Tentar Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('tv_calendar_cache')
        .select('*')
        .eq('is_active', true)
        .gt('expires_at', nowIso)
        .order('extracted_at', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        const cache = data[0] as AcademicCalendarCache
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache))
        return cache
      }
    } catch (err) {
      console.warn('[TV] Fallback local para calendário acadêmico:', err)
    }
  }

  // 2. Fallback localStorage com verificação estrita de expiração
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (saved) {
      const cache: AcademicCalendarCache = JSON.parse(saved)
      if (cache.is_active && new Date(cache.expires_at) > new Date()) {
        return cache
      } else {
        // Expirado -> limpa cache
        localStorage.removeItem(LOCAL_STORAGE_KEY)
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
    extracted_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      // Inativar anteriores
      await supabase.from('tv_calendar_cache').update({ is_active: false } as never).eq('semester_code', cacheData.semester_code)
      const { data, error } = await supabase.from('tv_calendar_cache').insert(record as never).select().single()
      if (!error && data) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data))
        return data as AcademicCalendarCache
      }
    } catch (err) {
      console.warn('[TV] Erro ao salvar cache no Supabase:', err)
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(record))
  return record
}

export async function extractCalendarFromPdf(pdfUrl: string, semesterCode: string, endDate: string): Promise<AcademicCalendarCache> {
  const resp = await fetch('/api/tv/calendar/extract', {
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
  localStorage.removeItem(LOCAL_STORAGE_KEY)
}
