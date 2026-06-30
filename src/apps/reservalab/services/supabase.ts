import { createClient } from '@supabase/supabase-js'
import type { TabletReserva } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: ReturnType<typeof createClient> | null = null

if (supabaseUrl && supabaseAnonKey) {
  client = createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = client

export async function fetchTabletReservas(desde?: Date, ate?: Date): Promise<TabletReserva[]> {
  if (!supabase) return []

  const hoje = desde || new Date()
  hoje.setHours(0, 0, 0, 0)
  const limite = ate || new Date(hoje)
  if (!ate) limite.setDate(limite.getDate() + 7)

  const { data } = await supabase
    .from('tablet_reservations')
    .select('*')
    .gte('horario_inicio', hoje.toISOString())
    .lt('horario_inicio', limite.toISOString())
    .eq('status', 'ativa')
    .order('horario_inicio', { ascending: true })

  return (data as TabletReserva[]) || []
}

export async function createTabletReserva(values: Record<string, unknown>): Promise<void> {
  if (!supabase) return
  await supabase.from('tablet_reservations').insert(values as never)
}

export async function updateTabletReserva(id: number, values: Record<string, unknown>): Promise<void> {
  if (!supabase) return
  await supabase.from('tablet_reservations').update(values as never).eq('id', id)
}

export async function deleteTabletReserva(id: number): Promise<void> {
  if (!supabase) return
  await supabase.from('tablet_reservations').delete().eq('id', id)
}

export async function cleanupOldCancelledTablets(): Promise<void> {
  if (!supabase) return
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('tablet_reservations')
    .delete()
    .eq('status', 'cancelada')
    .lt('horario_inicio', seteDiasAtras)
}
