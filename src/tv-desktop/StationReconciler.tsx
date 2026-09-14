import { useCallback, useEffect, useRef } from 'react'
import { useRealtimeBroadcast } from '../lib/useRealtimeBroadcast'
import { useMusicPlayer } from '../apps/tv/contexts/MusicPlayerContext'
import { getStationSnapshot, resolveStationPosition, type StationChangedSignal } from '../apps/tv/services/stationService'
import { workspaceStore } from '../core/workspaces/store'

/**
 * Reconciliador de estação (TV Desktop — Fase 2.2-C).
 *
 * O Broadcast NÃO é autoridade: ele apenas sinaliza "talvez o estado tenha
 * mudado". Este componente SEMPRE reconsulta `station_get_snapshot` (a verdade
 * no banco) e usa `state_sequence` como guard monotônico:
 *   - evento antigo/duplicado (sequence <= lastKnown) → ignorado;
 *   - eventos fora de ordem → o maior estado válido conhecido permanece;
 *   - resposta antiga de snapshot (race) nunca sobrescreve uma mais nova;
 *   - reconnect/SUBSCRIBED → reconsulta (recupera broadcasts perdidos offline);
 *   - falha de rede → mantém o último estado válido, sem corromper o player;
 *   - sinal de outro workspace → ignorado (não consulta snapshot de A).
 *
 * Fase 2.14: a transição de fila agora é decidida pelo SERVIDOR (auto-advance).
 * Este componente ganhou apenas o fatiamento de sinal RESTANTE — o Desktop que
 * executou um avanço re-emite o sinal `station-changed` via `onReady(send)` e
 * passa a receber o PRÓPRIO broadcast (`self: true`), sem alterar a lógica de
 * reconciliação acima.
 *
 * Sem player real (provider mockado em teste), não faz nada.
 */
export function StationReconciler({ onReady }: { onReady?: (send: (signal: StationChangedSignal) => void) => void }) {
  const { reconcileStation } = useMusicPlayer()

  /** Maior `state_sequence` já aplicado (monotônico; nunca regride). */
  const lastKnownSequence = useRef<number | null>(null)
  /** Token de geração: descarta resposta de request já superada (anti-race). */
  const requestId = useRef(0)
  /** Coalescência: só uma request em voo; sinais extras viram `pending`. */
  const inFlight = useRef(false)
  const pending = useRef(false)
  /** Último `onReady` fornecido (estável entre re-renders). */
  const onReadyRef = useRef(onReady)

  const reconcile = useCallback(async () => {
    if (typeof reconcileStation !== 'function') return

    if (inFlight.current) {
      // Dedup: um sinal que chega durante uma request em andamento é lembrado
      // e re-processado ao final (não perdemos uma sequência mais nova).
      pending.current = true
      return
    }
    inFlight.current = true

    const myRequest = ++requestId.current

    try {
      const snap = await getStationSnapshot()

      // Defesa residual contra race: resposta de request antiga é descartada.
      if (myRequest !== requestId.current) return

      // Guard monotônico (RECON-2): nunca aplicar estado <= já aplicado.
      const seq = snap.state_sequence
      if (lastKnownSequence.current !== null && seq <= lastKnownSequence.current) {
        return
      }
      lastKnownSequence.current = seq

      const current = snap.tracks?.find((t) => t.snapshot_track_id === snap.current_snapshot_track_id)
      reconcileStation({
        youtubeVideoId: current?.youtube_video_id ?? null,
        state: snap.state,
        positionSeconds: resolveStationPosition(snap),
      })
    } catch {
      // timeouts/rede/Supabase indisponível: mantém o último estado válido.
      // Nova tentativa ocorre no próximo sinal relevante ou no reconnect.
    } finally {
      inFlight.current = false
      if (pending.current) {
        pending.current = false
        void reconcile()
      }
    }
  }, [reconcileStation])

  const { send } = useRealtimeBroadcast<StationChangedSignal>(
    'tv-station-sync',
    'station-changed',
    (signal) => {
      // Workspace isolation: o Desktop nunca consulta snapshot de outro ws.
      const own = workspaceStore.activeWorkspaceId
      if (signal?.workspace_id && own && signal.workspace_id !== own) return

      // Filtro rápido (gatilho): sinal antigo/duplicado não dispara snapshot.
      if (
        signal?.sequence != null &&
        lastKnownSequence.current != null &&
        signal.sequence <= lastKnownSequence.current
      ) {
        return
      }
      void reconcile()
    },
    {
      // Fase 2.14 (self:true): o próprio Desktop re-emite sinais pós-auto-advance
      // (aplicado/replay) para notificar a si E aos demais Desktops do workspace.
      self: true,
      onStatus: (status) => {
        // RECON-1: (re)conexão do realtime sinaliza para reconsultar o snapshot,
        // recuperando quaisquer broadcasts perdidos durante o período offline.
        if (status === 'SUBSCRIBED') {
          void reconcile()
        }
      },
    },
  )

  // Fase 2.14: fornece o `send` do mesmo canal p/ o DisplayShell emitir o sinal
  // pós-auto-advance — sem criar uma segunda subscription no mesmo tópico.
  useEffect(() => {
    onReadyRef.current = onReady
    onReadyRef.current?.(send)
  }, [send, onReady])

  useEffect(() => {
    void reconcile()
  }, [reconcile])

  return null
}