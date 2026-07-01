import { createClient } from '@supabase/supabase-js'
import type { TvEvent, TvPlaylist } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: ReturnType<typeof createClient> | null = null

if (supabaseUrl && supabaseAnonKey) {
  client = createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = client

/* ── Events ── */

export async function fetchEvents(): Promise<TvEvent[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_events')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data as TvEvent[]) || []
}

export async function fetchAllEvents(): Promise<TvEvent[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_events')
    .select('*')
    .order('sort_order', { ascending: true })
  return (data as TvEvent[]) || []
}

export async function createEvent(values: Omit<TvEvent, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_events').insert(values as never)
}

export async function updateEvent(id: string, values: Partial<TvEvent>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_events').update(values as never).eq('id', id)
}

export async function deleteEvent(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_events').delete().eq('id', id)
}

/* ── Playlists ── */

export async function fetchPlaylists(type?: 'video' | 'music'): Promise<TvPlaylist[]> {
  if (!supabase) return []
  let query = supabase.from('tv_playlists').select('*').eq('is_active', true).order('sort_order', { ascending: true })
  if (type) query = query.eq('type', type)
  const { data } = await query
  return (data as TvPlaylist[]) || []
}

export async function fetchAllPlaylists(): Promise<TvPlaylist[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_playlists')
    .select('*')
    .order('sort_order', { ascending: true })
  return (data as TvPlaylist[]) || []
}

export async function createPlaylist(values: Omit<TvPlaylist, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_playlists').insert(values as never)
}

export async function updatePlaylist(id: string, values: Partial<TvPlaylist>): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_playlists').update(values as never).eq('id', id)
}

export async function deletePlaylist(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('tv_playlists').delete().eq('id', id)
}
