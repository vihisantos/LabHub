import { useEffect, useRef, useState } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'
import { tvApi } from '../../tv/utils/apiBase'
import type { ChamadosDisplaySnapshot } from '../types'

/** Intervalo de polling (o endpoint do PR 7 foi projetado para polling). */
export const CHAMADOS_POLL_MS = 30_000

export type ChamadosDisplayErrorKind =
  | 'unauthorized'      // 401 — sessão do kiosk precisa ser renovada
  | 'forbidden'         // 403 — device não autorizado
  | 'rate-limited'      // 429 — manter último snapshot
  | 'server'            // 502/5xx/resposta inválida — indisponível
  | 'network'           // falha de rede/offline

export class ChamadosDisplayError extends Error {
  kind: ChamadosDisplayErrorKind
  constructor(kind: ChamadosDisplayErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/**
 * Consome exclusivamente GET /api/tv/chamados/display com o JWT existente do
 * kiosk. Nenhum parâmetro de escopo é enviado: workspace/device são resolvidos
 * no servidor (PR 7). O frontend apenas chama o endpoint.
 */
export async function fetchChamadosDisplay(): Promise<ChamadosDisplaySnapshot> {
  if (!supabase) {
    throw new ChamadosDisplayError('network', 'Supabase não configurado')
  }
  const { data: sessData } = await supabase.auth.getSession()
  const token = sessData.session?.access_token
  if (!token) {
    throw new ChamadosDisplayError('unauthorized', 'Sessão do dispositivo ausente')
  }

  let res: Response
  try {
    res = await fetch(tvApi('/api/tv/chamados/display'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new ChamadosDisplayError('network', 'Falha de rede')
  }

  if (!res.ok) {
    const kind: ChamadosDisplayErrorKind =
      res.status === 401 ? 'unauthorized'
        : res.status === 403 ? 'forbidden'
          : res.status === 429 ? 'rate-limited'
            : 'server'
    throw new ChamadosDisplayError(kind, `HTTP ${res.status}`)
  }

  const body = (await res.json().catch(() => null)) as ChamadosDisplaySnapshot | null
  if (
    !body ||
    typeof body.generatedAt !== 'string' ||
    !body.summary ||
    typeof body.summary.total !== 'number' ||
    !Array.isArray(body.tickets)
  ) {
    throw new ChamadosDisplayError('server', 'Resposta inválida da API')
  }
  return body
}

interface ChamadosDisplayState {
  /** Primeiro carregamento (ainda sem snapshot). */
  loading: boolean
  /** Último snapshot válido em memória — nunca persistido. */
  snapshot: ChamadosDisplaySnapshot | null
  error: ChamadosDisplayErrorKind | null
}

/**
 * Snapshot + polling de 30s: primeiro fetch imediato, um único timer,
 * limpo no unmount; requests concorrentes são evitados; falhas mantêm o
 * último snapshot válido (a TV nunca fica sem tela por erro temporário).
 */
export function useChamadosDisplay(): ChamadosDisplayState {
  const [state, setState] = useState<ChamadosDisplayState>({
    loading: true,
    snapshot: null,
    error: null,
  })
  const inFlight = useRef(false)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled || inFlight.current) return
      inFlight.current = true
      try {
        const snapshot = await fetchChamadosDisplay()
        if (!cancelled) setState({ loading: false, snapshot, error: null })
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof ChamadosDisplayError ? err.kind : 'server',
          }))
        }
      } finally {
        inFlight.current = false
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), CHAMADOS_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return state
}
