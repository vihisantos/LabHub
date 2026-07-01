import { useState, useEffect } from 'react'
import { fetchEvents, fetchAllEvents, createEvent, updateEvent, deleteEvent } from '../services/supabase'
import type { TvEvent } from '../types'

export function useEvents() {
  const [events, setEvents] = useState<TvEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const data = await fetchEvents()
    setEvents(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return { events, loading, refresh: load }
}

export function useAllEvents() {
  const [events, setEvents] = useState<TvEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const data = await fetchAllEvents()
    setEvents(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const add = async (values: Omit<TvEvent, 'id' | 'created_at'>) => {
    await createEvent(values)
    await load()
  }

  const edit = async (id: string, values: Partial<TvEvent>) => {
    await updateEvent(id, values)
    await load()
  }

  const remove = async (id: string) => {
    await deleteEvent(id)
    await load()
  }

  return { events, loading, refresh: load, add, edit, remove }
}
