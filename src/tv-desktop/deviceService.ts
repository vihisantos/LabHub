import { defaultDb as supabase } from '../lib/supabase'
import { upsertDevice, heartbeatDevice } from '../apps/tv/services/supabase'
import { tvApi } from '../apps/tv/utils/apiBase'
import type { Workspace } from '../core/workspaces/types'

export interface RedeemResult {
  workspace: Workspace
  user_id: string
  device_name: string | null
}

/**
 * Valida e consome um código de ativação gerado no painel do site (PC).
 * Retorna o workspace e o usuário dono sem precisar de login na TV.
 */
export async function redeemActivationCode(code: string): Promise<RedeemResult> {
  const res = await fetch(tvApi('/api/tv/activation/redeem'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  })
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error('Falha ao se conectar com o servidor. Verifique a internet da TV.')
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Código de ativação inválido')
  }
  return {
    workspace: data.workspace as Workspace,
    user_id: data.user_id as string,
    device_name: data.device_name as string | null,
  }
}

/**
 * Registra (ou atualiza) o dispositivo no Supabase na primeira configuração.
 * O `user_id` é gravado na primeira criação para identificar o dono.
 */
export async function registerDevice(params: {
  deviceId: string
  name: string
  workspaceId: string
  userId: string
}): Promise<void> {
  await upsertDevice({
    id: params.deviceId,
    name: params.name,
    workspace_id: params.workspaceId,
    user_id: params.userId,
    last_seen: new Date().toISOString(),
  })
}

export function startHeartbeat(deviceId: string, intervalMs = 5 * 60 * 1000): () => void {
  const ping = () => heartbeatDevice(deviceId).catch(() => {})
  ping()
  const timer = setInterval(ping, intervalMs)
  return () => clearInterval(timer)
}

/** Indica se o ambiente é o app desktop Electron (vs navegador). */
export function isDesktop(): boolean {
  return !!window.desktop?.isDesktop
}

/** Abre o painel administrativo no navegador padrão. */
export function openAdminPanel(): void {
  if (window.desktop?.openAdmin) {
    window.desktop.openAdmin()
    return
  }
  const adminUrl = import.meta.env.VITE_TV_ADMIN_URL as string | undefined
  if (adminUrl) {
    window.open(adminUrl, '_blank')
  }
}

export function isSupabaseConfigured(): boolean {
  return !!supabase
}
