import { defaultDb } from '../../../lib/supabase'
import { workspaceStore } from '../../../core/workspaces/store'
import { tvApi } from '../utils/apiBase'
import type { TvMusicTrack } from '../types'

/**
 * Camada de COMANDO para a TV Station (migration 039).
 *
 * Toda mutação da estação passa por RPCs SECURITY DEFINER no PostgREST
 * (gate `can_access_tv_workspace`). Aqui:
 *   - o workspace vem SEMPRE da sessão (`workspaceStore.activeWorkspaceId`),
 *     nunca de um payload vindo do cliente/UI;
 *   - o `request_id` é único por operação e o `request_hash` é o SHA-256 do
 *     payload canônico — única fonte de idempotência (station_idempotency);
 *   - erros do RPC são mapeados para `StationError` tipado (nunca ignorados).
 *
 * O player real continua vivendo SOMENTE no TV Desktop. O Administrador Web
 * usa este serviço apenas para emitir comandos; áudio/iframe não existem aqui.
 */

export type StationState = 'stopped' | 'playing' | 'paused'

export interface SnapshotTrack {
  snapshot_track_id: string
  position: number
  youtube_video_id: string
  title: string
  duration_seconds: number
  /** Referência à origem tv_music_tracks (NULL se a origem sumiu). */
  track_id: string | null
}

export interface StationSnapshot {
  workspace_id: string
  state: StationState
  position_seconds: number
  started_at: string | null
  station_synced_at: string | null
  state_sequence: number
  queue_snapshot_id: string
  current_snapshot_track_id: string | null
  tracks: SnapshotTrack[]
}

export interface StationCommandResult {
  result: 'ok'
  state: StationState
  position_seconds: number
  started_at: string | null
  state_sequence: number
  queue_snapshot_id: string
  current_snapshot_track_id: string | null
}

/** Resultado de uma mutação emitida por este serviço. */
export interface StationCommandOutcome {
  workspace_id: string
  request_id: string
  result: StationCommandResult
}

/** Sinal mínimo transmitido via broadcast (NUNCA carrega a faixa em si). */
export interface StationChangedSignal {
  op: 'station_changed'
  workspace_id: string
  request_id: string
  sequence: number
}

/** Entrada para o Desktop reconciliar o player local com o estado da estação. */
export interface StationReconcileInput {
  youtubeVideoId: string | null
  state: StationState
  /** Posição autoritativa (segundos) já resolvida pelo reconciler. */
  positionSeconds: number
}

export type StationErrorCode =
  | 'NOT_CONFIGURED'
  | 'WORKSPACE_REQUIRED'
  | 'ACCESS_DENIED'
  | 'SEQUENCE_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSE'
  | 'TRACK_NOT_IN_SNAPSHOT'
  | 'NO_PREVIOUS_TRACK'
  | 'SEEK_OUT_OF_RANGE'
  | 'SNAPSHOT_UNAVAILABLE'
  | 'RPC_ERROR'

export class StationError extends Error {
  readonly code: StationErrorCode
  constructor(code: StationErrorCode, message: string) {
    super(message)
    this.name = 'StationError'
    this.code = code
  }
}

/* ── Mapeamento de erro ── */

const SQLSTATE_TO_CODE: Partial<Record<string, StationErrorCode>> = {
  '42501': 'ACCESS_DENIED',
  '40900': 'SEQUENCE_CONFLICT',
  '40901': 'IDEMPOTENCY_KEY_REUSE',
  '40907': 'NO_PREVIOUS_TRACK',
  '40908': 'TRACK_NOT_IN_SNAPSHOT',
  '22023': 'SEEK_OUT_OF_RANGE',
}

function detectCode(message: string): StationErrorCode {
  const m = message.toUpperCase()
  if (m.includes('ACCESS_DENIED')) return 'ACCESS_DENIED'
  if (m.includes('SEQUENCE_CONFLICT')) return 'SEQUENCE_CONFLICT'
  if (m.includes('IDEMPOTENCY_KEY_REUSE')) return 'IDEMPOTENCY_KEY_REUSE'
  if (m.includes('NO_PREVIOUS_TRACK')) return 'NO_PREVIOUS_TRACK'
  if (m.includes('SEEK_OUT_OF_RANGE')) return 'SEEK_OUT_OF_RANGE'
  if (m.includes('TRACK_NOT_IN_SNAPSHOT')) return 'TRACK_NOT_IN_SNAPSHOT'
  if (m.includes('INVALID_TRACK')) return 'TRACK_NOT_IN_SNAPSHOT'
  return 'RPC_ERROR'
}

function mapError(error: unknown): StationError {
  const e = error as { code?: string; message?: string } | null
  const sql = e?.code ?? ''
  const message = e?.message ?? 'Erro desconhecido na estação'
  const code = SQLSTATE_TO_CODE[sql] ?? detectCode(message)
  return new StationError(code, message)
}

/* ── Idempotência (request_hash = SHA-256 do payload canônico) ── */

function canonicalPayload(input: { workspace_id: string; snapshot_track_id: string }): string {
  return `track_change:${input.workspace_id}:${input.snapshot_track_id}`
}

/** Payload canônico de comandos de estado (stop/pause/resume/next/previous). */
function canonicalOpPayload(op: 'stop' | 'pause' | 'resume' | 'next' | 'previous', workspace_id: string): string {
  return `${op}:${workspace_id}`
}

/** Payload canônico do SEEK (a posição faz parte da identidade do comando). */
function canonicalSeekPayload(workspace_id: string, position: number): string {
  return `seek:${workspace_id}:${position}`
}

/** SHA-256 (Web Crypto) → hex. Fallback determinístico (não criptográfico) p/ ambientes sem subtle. */
async function sha256Hex(input: string): Promise<string> {
  const crypto = globalThis.crypto
  if (crypto && 'subtle' in crypto) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    } catch {
      /* fallback abaixo */
    }
  }
  let h1 = 0xdeadbeef ^ input.length
  let h2 = 0x41c6ce57 ^ input.length
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

/* ── Resolução de faixa dentro do snapshot ── */

function resolveSnapshotTrack(snapshot: StationSnapshot, track: TvMusicTrack): SnapshotTrack | null {
  // 1) Por origem real (tv_music_tracks id) — cobre faixas de filas.
  if (track.queue_id) {
    const byTrack = snapshot.tracks.find((t) => t.track_id === track.id)
    if (byTrack) return byTrack
  }
  // 2) Por youtube_video_id — cobre pedidos de música sem track_id.
  return snapshot.tracks.find((t) => t.youtube_video_id === track.youtube_video_id) ?? null
}

/** Posição autoritativa da estação (segundos) conforme o modelo temporal da 039:
 *   pos = position_seconds + (now - started_at)   quando state='playing'
 *   pos = position_seconds                         caso contrário. */
export function resolveStationPosition(snap: {
  state: StationState
  position_seconds: number
  started_at: string | null
}): number {
  if (snap.state !== 'playing' || !snap.started_at) return snap.position_seconds
  const elapsed = (Date.now() - new Date(snap.started_at).getTime()) / 1000
  return snap.position_seconds + elapsed
}

/* ── Leitura ── */

export async function getStationSnapshot(): Promise<StationSnapshot> {
  if (!defaultDb) throw new StationError('NOT_CONFIGURED', 'Supabase não configurado')
  const ws = workspaceStore.activeWorkspaceId
  if (!ws) throw new StationError('WORKSPACE_REQUIRED', 'Workspace não selecionado')

  const { data, error } = await defaultDb.rpc('station_get_snapshot', { p_workspace: ws })
  if (error) throw mapError(error)
  if (!data) throw new StationError('SNAPSHOT_UNAVAILABLE', 'Snapshot da estação indisponível')
  return data as StationSnapshot
}

/* ── Comando ── */

export async function playTrackNow(track: TvMusicTrack): Promise<StationCommandOutcome> {
  if (!defaultDb) throw new StationError('NOT_CONFIGURED', 'Supabase não configurado')
  const ws = workspaceStore.activeWorkspaceId
  if (!ws) throw new StationError('WORKSPACE_REQUIRED', 'Workspace não selecionado')

  const snapshot = await getStationSnapshot()

  const snapTrack = resolveSnapshotTrack(snapshot, track)
  if (!snapTrack) {
    throw new StationError(
      'TRACK_NOT_IN_SNAPSHOT',
      `Faixa "${track.title || track.youtube_video_id}" não está na fila da estação`,
    )
  }

  const requestId = `track-change:${ws}:${crypto.randomUUID()}`
  const requestHash = await sha256Hex(canonicalPayload({ workspace_id: ws, snapshot_track_id: snapTrack.snapshot_track_id }))

  const { data, error } = await defaultDb.rpc('station_track_change', {
    p_workspace: ws,
    p_snapshot_track_id: snapTrack.snapshot_track_id,
    p_idempotency_key: requestId,
    p_request_hash: requestHash,
    p_expected_sequence: snapshot.state_sequence,
  })

  if (error) throw mapError(error)

  return {
    workspace_id: ws,
    request_id: requestId,
    result: data as StationCommandResult,
  }
}

/**
 * Comando de estado (stop/pause/resume/next/previous) da estação do workspace
 * da sessão. Idempotente (request_id + request_hash) e otimista
 * (expected_sequence do snapshot lido). `station_stop`, `station_pause`,
 * `station_resume`, `station_next` e `station_previous` compartilham a mesma
 * assinatura (uuid, text, text, bigint). A escolha da faixa (next/previous) e o
 * cálculo de posição acontecem no Station — o cliente NÃO envia posição/faixa.
 */
async function mutateStation(op: 'stop' | 'pause' | 'resume' | 'next' | 'previous'): Promise<StationCommandOutcome> {
  if (!defaultDb) throw new StationError('NOT_CONFIGURED', 'Supabase não configurado')
  const ws = workspaceStore.activeWorkspaceId
  if (!ws) throw new StationError('WORKSPACE_REQUIRED', 'Workspace não selecionado')

  const snapshot = await getStationSnapshot()

  const requestId = `${op}:${ws}:${crypto.randomUUID()}`
  const requestHash = await sha256Hex(canonicalOpPayload(op, ws))

  const { data, error } = await defaultDb.rpc(`station_${op}`, {
    p_workspace: ws,
    p_idempotency_key: requestId,
    p_request_hash: requestHash,
    p_expected_sequence: snapshot.state_sequence,
  })

  if (error) throw mapError(error)

  return {
    workspace_id: ws,
    request_id: requestId,
    result: data as StationCommandResult,
  }
}

/** Interrompe a reprodução da estação (state='stopped', current_snapshot_track_id=NULL). */
export function stopStation(): Promise<StationCommandOutcome> {
  return mutateStation('stop')
}

/** Pausa a estação preservando a faixa e a posição (state='paused'). */
export function pauseStation(): Promise<StationCommandOutcome> {
  return mutateStation('pause')
}

/** Retoma a estação a partir da posição pausada (state='playing'). */
export function resumeStation(): Promise<StationCommandOutcome> {
  return mutateStation('resume')
}

/** Avança para a próxima faixa (o Station escolhe; na última faixa → stopped). */
export function nextStation(): Promise<StationCommandOutcome> {
  return mutateStation('next')
}

/** Volta para a faixa anterior (o Station escolhe; na primeira faixa → erro NO_PREVIOUS_TRACK). */
export function previousStation(): Promise<StationCommandOutcome> {
  return mutateStation('previous')
}

/**
 * SEEK: reposiciona a estação para `position` segundos (double precision).
 * O Station é a autoridade temporal e de validação (SEEK_OUT_OF_RANGE para
 * negativo ou acima da duração). Não altera faixa nem estado localmente.
 */
export async function seekStation(position: number): Promise<StationCommandOutcome> {
  if (!defaultDb) throw new StationError('NOT_CONFIGURED', 'Supabase não configurado')
  const ws = workspaceStore.activeWorkspaceId
  if (!ws) throw new StationError('WORKSPACE_REQUIRED', 'Workspace não selecionado')

  const snapshot = await getStationSnapshot()

  const requestId = `seek:${ws}:${crypto.randomUUID()}`
  const requestHash = await sha256Hex(canonicalSeekPayload(ws, position))

  const { data, error } = await defaultDb.rpc('station_seek', {
    p_workspace: ws,
    p_position: position,
    p_idempotency_key: requestId,
    p_request_hash: requestHash,
    p_expected_sequence: snapshot.state_sequence,
  })

  if (error) throw mapError(error)

  return {
    workspace_id: ws,
    request_id: requestId,
    result: data as StationCommandResult,
  }
}

/* ── Fase 2.14: Auto-advance autoritativo (sinal do Desktop → servidor) ── */

export type AutoAdvanceStatus = 'applied' | 'replayed' | 'no_op' | 'conflict'

export interface AutoAdvanceOutcome {
  status: AutoAdvanceStatus
  result?: StationCommandResult
  /** Id do vídeo autoritativo p/ reconciliar o player local (applied/replayed). */
  newVideoId?: string
  reason?: string
}

/**
 * Reporta o fim de uma faixa ao servidor (Fase 2.14).
 *
 * O Desktop NUNCA calcula a próxima faixa: o servidor decide e aplica o avanço
 * via station_auto_advance. Aqui:
 *   1. lê o snapshot vigente para enviar o `p_current_snapshot_track_id`
 *      (guarda de corrida contra mudança feita por outro Admin/device);
 *   2. chama POST /api/tv/station/auto-advance com a sessão do device;
 *   3. resolve o `newVideoId` do estado pós-transição p/ reconciliação local.
 *
 * Lança StationError em falha de rede/sessão. O caller (onEnd) trata erros
 * silenciosamente — o backstop de até 5 min cobre falhas pontuais.
 */
export async function reportStationTrackEnded(): Promise<AutoAdvanceOutcome> {
  if (!defaultDb) throw new StationError('NOT_CONFIGURED', 'Supabase não configurado')
  const session = await defaultDb.auth.getSession()
  const token = session.data?.session?.access_token
  if (!token) throw new StationError('ACCESS_DENIED', 'Sessão ausente — fim de faixa não reportado')

  let currentSnapshotTrackId: string | null = null
  let snapshot: StationSnapshot | null = null
  try {
    snapshot = await getStationSnapshot()
    currentSnapshotTrackId = snapshot.current_snapshot_track_id
  } catch {
    // Snapshot indisponível: envia NULL — o shim valida por tempo decorrido.
  }

  const res = await fetch(tvApi('/api/tv/station/auto-advance'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ current_snapshot_track_id: currentSnapshotTrackId ?? undefined }),
  })

  if (!res.ok) {
    throw new StationError('RPC_ERROR', 'Falha ao reportar o fim da faixa')
  }

  const data = (await res.json()) as {
    status?: string
    reason?: string
    result?: StationCommandResult
  }

  const status = (data.status ?? 'no_op') as AutoAdvanceStatus

  let newVideoId: string | undefined
  if ((status === 'applied' || status === 'replayed') && snapshot && data.result?.current_snapshot_track_id) {
    const match = snapshot.tracks.find((t) => t.snapshot_track_id === data.result!.current_snapshot_track_id)
    if (match) newVideoId = match.youtube_video_id
  }

  if (status === 'applied' || status === 'replayed') {
    console.debug('[tv-station] auto-advance %s ws=%s', status, workspaceStore.activeWorkspaceId)
  }

  return {
    status,
    result: data.result,
    newVideoId,
    reason: data.reason,
  }
}