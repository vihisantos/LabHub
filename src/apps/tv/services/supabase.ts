import { defaultDb as supabase } from '../../../lib/supabase'
import type { TvEvent, TvPlaylist, TvMusicQueue, TvMusicTrack, TvAnnouncement, TvGallery, TvGalleryPhoto } from '../types'

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
  const { error } = await supabase.from('tv_events').insert(values as never)
  if (error) throw error
}

export async function updateEvent(id: string, values: Partial<TvEvent>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_events').update(values as never).eq('id', id)
  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_events').delete().eq('id', id)
  if (error) throw error
}

/* ── Playlists ── */

export async function fetchPlaylists(): Promise<TvPlaylist[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_playlists')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
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
  const { error } = await supabase.from('tv_playlists').insert(values as never)
  if (error) throw error
}

export async function updatePlaylist(id: string, values: Partial<TvPlaylist>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_playlists').update(values as never).eq('id', id)
  if (error) throw error
}

export async function deletePlaylist(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_playlists').delete().eq('id', id)
  if (error) throw error
}

/* ── Music Queues ── */

export async function fetchQueues(): Promise<TvMusicQueue[]> {
  if (!supabase) return []
  const { data } = await supabase.from('tv_music_queues').select('*').order('created_at', { ascending: true })
  return (data as TvMusicQueue[]) || []
}

export async function createQueue(values: Partial<TvMusicQueue>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_music_queues').insert(values as never)
  if (error) throw error
}

export async function updateQueue(id: string, values: Partial<TvMusicQueue>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_music_queues').update(values as never).eq('id', id)
  if (error) throw error
}

export async function deleteQueue(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_music_queues').delete().eq('id', id)
  if (error) throw error
}

/* ── Music Tracks ── */

export async function fetchTracks(queueId: string): Promise<TvMusicTrack[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_music_tracks')
    .select('*')
    .eq('queue_id', queueId)
    .order('position', { ascending: true })
  return (data as TvMusicTrack[]) || []
}

export async function createTrack(track: Omit<TvMusicTrack, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_music_tracks').insert(track as never)
  if (error) throw error
}

export async function createTracks(tracks: Omit<TvMusicTrack, 'id' | 'created_at'>[]): Promise<void> {
  if (!supabase) return
  if (tracks.length === 0) return
  const { error } = await supabase.from('tv_music_tracks').insert(tracks as never)
  if (error) throw error
}

export async function deleteTrack(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_music_tracks').delete().eq('id', id)
  if (error) throw error
}

/* ── Announcements ── */

export async function fetchAnnouncements(): Promise<TvAnnouncement[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_announcements')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data as TvAnnouncement[]) || []
}

export async function fetchAllAnnouncements(): Promise<TvAnnouncement[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_announcements')
    .select('*')
    .order('sort_order', { ascending: true })
  return (data as TvAnnouncement[]) || []
}

export async function createAnnouncement(values: Omit<TvAnnouncement, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_announcements').insert(values as never)
  if (error) throw error
}

export async function updateAnnouncement(id: string, values: Partial<TvAnnouncement>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_announcements').update(values as never).eq('id', id)
  if (error) throw error
}

export async function deleteAnnouncement(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_announcements').delete().eq('id', id)
  if (error) throw error
}

export async function reorderTracks(_queueId: string, trackIds: string[]): Promise<void> {
  if (!supabase) return
  for (const [idx, id] of trackIds.entries()) {
    const { error } = await supabase.from('tv_music_tracks').update({ position: idx }).eq('id', id)
    if (error) throw error
  }
}

/* ── Photo Galleries ── */

export async function fetchActiveGallery(): Promise<TvGallery | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('tv_galleries')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single()
  return data as TvGallery | null
}

export async function fetchGalleries(): Promise<TvGallery[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_galleries')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as TvGallery[]) || []
}

export async function createGallery(title: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_galleries').insert({ title } as never)
  if (error) throw error
}

export async function deleteGallery(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_galleries').delete().eq('id', id)
  if (error) throw error
}

export async function setActiveGallery(id: string | null): Promise<void> {
  if (!supabase) return
  if (id) {
    await supabase.from('tv_galleries').update({ is_active: false }).neq('id', id)
    const { error } = await supabase.from('tv_galleries').update({ is_active: true }).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('tv_galleries').update({ is_active: false }).eq('is_active', true)
    if (error) throw error
  }
}

export async function fetchGalleryPhotos(galleryId: string): Promise<TvGalleryPhoto[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_gallery_photos')
    .select('*')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
  return (data as TvGalleryPhoto[]) || []
}

export async function addGalleryPhoto(galleryId: string, imageUrl: string): Promise<void> {
  if (!supabase) return
  const { data: existing } = await supabase
    .from('tv_gallery_photos')
    .select('sort_order')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0
  const { error } = await supabase
    .from('tv_gallery_photos')
    .insert({ gallery_id: galleryId, image_url: imageUrl, sort_order: nextOrder } as never)
  if (error) throw error
}

export async function deleteGalleryPhoto(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('tv_gallery_photos').delete().eq('id', id)
  if (error) throw error
}

export async function reorderGalleryPhotos(ids: string[]): Promise<void> {
  if (!supabase) return
  for (const [idx, id] of ids.entries()) {
    const { error } = await supabase.from('tv_gallery_photos').update({ sort_order: idx }).eq('id', id)
    if (error) throw error
  }
}
