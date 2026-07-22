import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchActiveCalendarCache, extractCalendarFromPdf, clearCalendarCache, type AcademicCalendarCache, type CalendarEventItem } from '../services/calendarService'
import type { TvEvent } from '../types'
import { getSafeEventImageUrl } from '../utils/eventImageProvider'

export function useAcademicCalendar() {
  const [calendarCache, setCalendarCache] = useState<AcademicCalendarCache | null>(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCache = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const cache = await fetchActiveCalendarCache()
      setCalendarCache(cache)
    } catch (err: any) {
      console.error('[TV] Erro ao carregar calendário:', err)
      setError(err.message || 'Falha ao carregar calendário')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCache()
  }, [loadCache])

  const extract = async (pdfUrl: string, semesterCode: string, endDate: string) => {
    setExtracting(true)
    setError(null)
    try {
      const newCache = await extractCalendarFromPdf(pdfUrl, semesterCode, endDate)
      setCalendarCache(newCache)
      return newCache
    } catch (err: any) {
      setError(err.message || 'Erro ao extrair PDF do calendário')
      throw err
    } finally {
      setExtracting(false)
    }
  }

  const clear = async () => {
    await clearCalendarCache(calendarCache?.semester_code)
    setCalendarCache(null)
  }

  /**
   * Converte os itens do calendário para o formato de TvEvent aceito pelo display
   */
  const calendarTvEvents = useMemo<TvEvent[]>(() => {
    if (!calendarCache || !calendarCache.events) return []

    return calendarCache.events.map((item: CalendarEventItem, idx: number) => {
      const safeImage = getSafeEventImageUrl(item.title, `Calendário Acadêmico ${calendarCache.semester_code}`)

      return {
        id: `cal_event_${item.id || idx}`,
        title: item.title,
        description: `📅 ${item.day_part} · Calendário Acadêmico UAM (${calendarCache.semester_code})`,
        image_url: safeImage,
        pdf_url: calendarCache.source_url,
        start_date: null,
        end_date: null,
        is_active: true,
        sort_order: 1000 + idx,
        created_at: calendarCache.extracted_at,
      }
    })
  }, [calendarCache])

  return {
    calendarCache,
    calendarTvEvents,
    loading,
    extracting,
    error,
    extract,
    clear,
    reload: loadCache,
  }
}
