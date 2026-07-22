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
  if (!supabase) throw new Error('Supabase not initialized')
  const { error } = await supabase.from('tv_events').insert(values as never)
  if (error) throw error
}

export async function updateEvent(id: string, values: Partial<TvEvent>): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const { error } = await supabase.from('tv_events').update(values as never).eq('id', id)
  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
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
  if (!supabase) throw new Error('Supabase not initialized')
  const { error } = await supabase.from('tv_playlists').insert(values)
  if (error) throw error
}

export async function updatePlaylist(id: string, values: Partial<TvPlaylist>): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const { error } = await supabase.from('tv_playlists').update(values as never).eq('id', id)
  if (error) throw error
}

export async function deletePlaylist(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
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

export async function fetchActiveGalleries(): Promise<TvGallery[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_galleries')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data as TvGallery[]) || []
}

export async function fetchGalleries(): Promise<TvGallery[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('tv_galleries')
    .select('*')
    .order('sort_order', { ascending: true })
  return (data as TvGallery[]) || []
}

export async function createGallery(title: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const { error } = await supabase.from('tv_galleries').insert({ title, sort_order: 0 } as never)
  if (error) throw error
}

export async function deleteGallery(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const { error } = await supabase.from('tv_galleries').delete().eq('id', id)
  if (error) throw error
}

export async function toggleGalleryActive(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const { data: current } = await supabase
    .from('tv_galleries')
    .select('is_active')
    .eq('id', id)
    .single()
  if (!current) return
  const { error } = await supabase
    .from('tv_galleries')
    .update({ is_active: !current.is_active })
    .eq('id', id)
  if (error) throw error
}

export async function setGalleryOrder(ids: string[]): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  for (const [idx, id] of ids.entries()) {
    const { error } = await supabase.from('tv_galleries').update({ sort_order: idx }).eq('id', id)
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
  if (!supabase) throw new Error('Supabase not initialized')
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

/**
 * Extrai o public_id de uma URL do Cloudinary.
 * Ex: https://res.cloudinary.com/horytsxg/image/upload/v12345/tv/abc.jpg → tv/abc
 */
function extractCloudinaryPublicId(imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl)
    // Path pattern: /{cloud_name}/image/upload/v{version}/{public_id}.{ext}
    const match = url.pathname.match(/\/image\/upload\/(?:v\d+\/)?(.+)$/)
    if (!match) return null
    let publicId = match[1]
    // Remove extension
    publicId = publicId.replace(/\.(jpg|jpeg|png|gif|webp|svg|pdf)(\?.*)?$/i, '')
    return publicId || null
  } catch {
    return null
  }
}

/**
 * Tenta deletar a imagem do Cloudinary via backend.
 * Falha silenciosamente se o backend não estiver disponível.
 */
async function deleteFromCloudinary(imageUrl: string): Promise<void> {
  try {
    const publicId = extractCloudinaryPublicId(imageUrl)
    if (!publicId) {
      console.warn('[Cloudinary] Não foi possível extrair public_id da URL:', imageUrl)
      return
    }
    const res = await fetch('/api/tv/cloudinary/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    })
    const data = await res.json()
    if (data.success) {
      console.log('[Cloudinary] Imagem deletada:', publicId)
    } else if (data.error) {
      console.warn('[Cloudinary] Erro ao deletar:', data.error)
    }
  } catch (err) {
    console.warn('[Cloudinary] Falha ao chamar delete endpoint:', err)
  }
}

export async function deleteGalleryPhoto(id: string, imageUrl?: string | null): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')

  // 1. Se temos a URL, tenta deletar do Cloudinary primeiro
  if (imageUrl) {
    await deleteFromCloudinary(imageUrl)
  } else {
    // Fallback: busca a URL antes de deletar
    try {
      const { data: photo } = await supabase
        .from('tv_gallery_photos')
        .select('image_url')
        .eq('id', id)
        .single()
      if (photo?.image_url) {
        await deleteFromCloudinary(photo.image_url)
      }
    } catch {
      // Silencioso — segue para deletar do DB mesmo assim
    }
  }

  // 2. Deleta o registro do banco
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
