import { defaultDb as supabase } from '../../../lib/supabase'
import { workspaceStore } from '../../../core/workspaces/store'
import { tvApi } from '../utils/apiBase'
import type { TvEvent, TvPlaylist, TvAnnouncement, TvGallery, TvGalleryPhoto, TvDevice, ScheduledResolution } from '../types'

/* ── Helpers ── */

export class TvServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TvServiceError'
  }
}

function workspaceId(): string | null {
  return workspaceStore.activeWorkspaceId
}

function scoped<T extends { workspace_id?: string | null }>(rows: T[]): T[] {
  return workspaceStore.filter(rows)
}

/* ── Scheduled Content Resolution (via tv_resolve_scheduled_content 4-arg) ── */

/**
 * Calcula data (YYYY-MM-DD) e hora (HH:MM:SS) em America/Sao_Paulo.
 * O kiosk Opera em horário local; a checagem dupla garante determinismo.
 */
function nowSaoPaulo(): { date: string; time: string } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  }
}

/**
 * Resolve o conteúdo ativo via `tv_resolve_scheduled_content` (4-arg overload)
 * e busca o `tv_events` correspondente.
 *
 * - Retorna o evento resolvido (scheduled ou legacy).
 * - Retorna `null` quando não há conteúdo (resolver retorna NULL).
 * - Não faz leitura ampla em `tv_events`: busca somente o `event_id` retornado.
 */
export async function fetchScheduledContent(deviceId?: string | null): Promise<TvEvent | null> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) return null

  const { date, time } = nowSaoPaulo()

  const { data: resolution, error: resolveError } = await supabase.rpc(
    'tv_resolve_scheduled_content',
    {
      p_workspace_id: ws,
      p_device_id: deviceId ?? null,
      p_date: date,
      p_time: time,
    },
  )
  if (resolveError || !resolution) return null

  const resolved = resolution as ScheduledResolution
  if (!resolved.event_id) return null

  const { data: event, error: eventError } = await supabase
    .from('tv_events')
    .select('*')
    .eq('id', resolved.event_id)
    .eq('workspace_id', ws)
    .maybeSingle()

  if (eventError || !event) return null
  return event as TvEvent
}

/* ── Playlists ── */

export async function fetchPlaylists(): Promise<TvPlaylist[]> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase
    .from('tv_playlists')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return scoped((data as TvPlaylist[]) || [])
}

export async function fetchAllPlaylists(): Promise<TvPlaylist[]> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase
    .from('tv_playlists')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return scoped((data as TvPlaylist[]) || [])
}

export async function createPlaylist(values: Omit<TvPlaylist, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_playlists').insert({ ...values, workspace_id: ws })
  if (error) throw error
}

export async function updatePlaylist(id: string, values: Partial<TvPlaylist>): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_playlists').update(values).eq('id', id).eq('workspace_id', ws)
  if (error) throw error
}

export async function deletePlaylist(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_playlists').delete().eq('id', id).eq('workspace_id', ws)
  if (error) throw error
}

/* ── Announcements ── */

export async function fetchAnnouncements(): Promise<TvAnnouncement[]> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase
    .from('tv_announcements')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return scoped((data as TvAnnouncement[]) || [])
}

export async function fetchAllAnnouncements(): Promise<TvAnnouncement[]> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase
    .from('tv_announcements')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return scoped((data as TvAnnouncement[]) || [])
}

export async function createAnnouncement(values: Omit<TvAnnouncement, 'id' | 'created_at'>): Promise<void> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_announcements').insert({ ...values, workspace_id: ws })
  if (error) throw error
}

export async function updateAnnouncement(id: string, values: Partial<TvAnnouncement>): Promise<void> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_announcements').update(values).eq('id', id).eq('workspace_id', ws)
  if (error) throw error
}

export async function deleteAnnouncement(id: string): Promise<void> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_announcements').delete().eq('id', id).eq('workspace_id', ws)
  if (error) throw error
}


/* ── Photo Galleries ── */

export async function fetchActiveGalleries(): Promise<TvGallery[]> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase
    .from('tv_galleries')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return scoped((data as TvGallery[]) || [])
}

export async function fetchGalleries(): Promise<TvGallery[]> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase
    .from('tv_galleries')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return scoped((data as TvGallery[]) || [])
}

export async function createGallery(title: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_galleries').insert({ title, sort_order: 0, workspace_id: ws })
  if (error) throw error
}

export async function deleteGallery(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_galleries').delete().eq('id', id).eq('workspace_id', ws)
  if (error) throw error
}

export async function toggleGalleryActive(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { data: current } = await supabase
    .from('tv_galleries')
    .select('is_active')
    .eq('id', id)
    .eq('workspace_id', ws)
    .single()
  if (!current) return
  const { error } = await supabase
    .from('tv_galleries')
    .update({ is_active: !current.is_active })
    .eq('id', id)
    .eq('workspace_id', ws)
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
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase
    .from('tv_gallery_photos')
    .select('*')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
  if (error) throw error
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
    .insert({ gallery_id: galleryId, image_url: imageUrl, sort_order: nextOrder })
  if (error) throw error
}

/**
 * Tenta deletar a imagem do Cloudinary via backend.
 * Falha silenciosamente se o backend não estiver disponível.
 * A extração do public_id é feita pelo backend; o frontend só envia a URL.
 */
async function deleteFromCloudinary(imageUrl: string): Promise<void> {
  try {
    const res = await fetch(tvApi('/api/tv/cloudinary/delete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    })
    const data = await res.json()
    if (data.success) {
      console.log('[Cloudinary] Imagem deletada')
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
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  for (const [idx, id] of ids.entries()) {
    const { error } = await supabase.from('tv_gallery_photos').update({ sort_order: idx }).eq('id', id)
    if (error) throw error
  }
}

/* ── TV Devices (desktop display) ── */

export async function fetchDevices(): Promise<TvDevice[]> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase.from('tv_devices').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return scoped((data as TvDevice[]) || [])
}

/** TVs (dispositivos) registradas em um workspace específico. */
export async function fetchWorkspaceDevices(workspaceId: string): Promise<TvDevice[]> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  if (!workspaceId) return []
  const { data, error } = await supabase
    .from('tv_devices')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as TvDevice[]) || []
}

export async function fetchDeviceById(id: string): Promise<TvDevice | null> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const { data, error } = await supabase.from('tv_devices').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as TvDevice) || null
}

/** Registra ou atualiza a TV desktop. `user_id` é definido na 1ª criação. */
export async function upsertDevice(device: {
  id: string
  name: string
  workspace_id: string | null
  user_id?: string | null
  last_seen?: string | null
}): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const { error } = await supabase.from('tv_devices').upsert(device, { onConflict: 'id' })
  if (error) throw error
}

export async function heartbeatDevice(id: string): Promise<void> {
  if (!supabase) throw new TvServiceError('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) return
  const { error } = await supabase
    .from('tv_devices')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', ws)
  if (error) throw new TvServiceError(`Heartbeat device failed: ${error.message}`)
}

export async function updateDevice(id: string, values: Partial<TvDevice>): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_devices').update(values).eq('id', id).eq('workspace_id', ws)
  if (error) throw error
}

export async function deleteDevice(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')
  const ws = workspaceId()
  if (!ws) throw new Error('Workspace não selecionado')
  const { error } = await supabase.from('tv_devices').delete().eq('id', id).eq('workspace_id', ws)
  if (error) throw error
}