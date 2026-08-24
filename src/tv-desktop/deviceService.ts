import { defaultDb as supabase } from '../lib/supabase'
import { heartbeatDevice } from '../apps/tv/services/supabase'
import { tvApi } from '../apps/tv/utils/apiBase'
import type { Workspace } from '../core/workspaces/types'

export interface ActivationResult {
  workspace: Workspace
  device_name: string
}

interface ProvisionResponse {
  success?: boolean
  error?: string
  workspace?: Workspace
  device_name?: string | null
  token_hash?: string
}

/**
 * Troca o token_hash (magiclink gerado pelo backend) por uma sessão Supabase
 * do próprio kiosk. A partir daqui o app usa identidade própria de device
 * (refresh automático, revogável admin-side) — não mais a anon key aberta.
 */
async function exchangeTokenHash(tokenHash: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado neste dispositivo')
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })
  if (error) throw new Error(error.message)
}

/**
 * Valida e consome um código de ativação gerado no painel do site (PC).
 * O backend provisiona a identidade do kiosk (usuário sem senha + vínculo em
 * tv_devices) e devolve o token_hash; aqui trocamos por sessão local.
 */
export async function redeemActivationCode(
  code: string,
  deviceId: string,
  deviceName?: string,
): Promise<ActivationResult> {
  const res = await fetch(tvApi('/api/tv/activation/redeem'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: code.trim().toUpperCase(),
      device_id: deviceId,
      device_name: deviceName || undefined,
    }),
  })
  let data: ProvisionResponse
  try {
    data = await res.json()
  } catch {
    throw new Error('Falha ao se conectar com o servidor. Verifique a internet da TV.')
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Código de ativação inválido')
  }
  if (!data.token_hash || !data.workspace) {
    throw new Error('Resposta de ativação incompleta')
  }
  await exchangeTokenHash(data.token_hash)
  return {
    workspace: data.workspace,
    device_name: (data.device_name || '').trim(),
  }
}

/**
 * Fluxo alternativo (login humano no desktop): usa a sessão do usuário para
 * autorizar o provisionamento e, ao final, substitui a sessão local pela
 * sessão de device — credenciais humanas não permanecem na TV.
 */
export async function provisionWithLogin(params: {
  workspaceId: string
  deviceId: string
  deviceName: string
}): Promise<ActivationResult> {
  if (!supabase) throw new Error('Supabase não configurado neste dispositivo')
  const { data: sessData } = await supabase.auth.getSession()
  const token = sessData.session?.access_token
  if (!token) throw new Error('Sessão humana ausente — faça login novamente')

  const res = await fetch(tvApi('/api/tv/devices/provision'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      workspace_id: params.workspaceId,
      device_id: params.deviceId,
      device_name: params.deviceName,
    }),
  })
  let data: ProvisionResponse
  try {
    data = await res.json()
  } catch {
    throw new Error('Falha ao se conectar com o servidor. Verifique a internet da TV.')
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Não foi possível registrar a TV')
  }
  if (!data.token_hash || !data.workspace) {
    throw new Error('Resposta de provisionamento incompleta')
  }
  await exchangeTokenHash(data.token_hash)
  return {
    workspace: data.workspace,
    device_name: (data.device_name || '').trim(),
  }
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

/**
 * Sessão atual pertence a um kiosk (não a um humano que só passou pelo login)?
 */
export async function hasDeviceSession(): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data } = await supabase.auth.getSession()
    const meta = data.session?.user?.user_metadata as { role?: string } | undefined
    return !!data.session && meta?.role === 'tv_device'
  } catch {
    return false
  }
}
