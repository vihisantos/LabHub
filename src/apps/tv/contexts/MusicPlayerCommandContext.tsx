import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { useRealtimeBroadcast } from '../../../lib/useRealtimeBroadcast'
import {
  playTrackNow,
  stopStation,
  pauseStation,
  resumeStation,
  nextStation,
  previousStation,
  seekStation,
  StationError,
  type StationChangedSignal,
  type StationCommandOutcome,
} from '../services/stationService'
import type { TvMusicTrack } from '../types'

/**
 * Camada de COMANDO do Admin Web (Fase 2.2/2.3 — comando real para a TV Station).
 *
 * O Admin NÃO reproduz áudio. O player real (`MusicPlayerProvider`) vive
 * SOMENTE no TV Desktop (`src/tv-desktop/DisplayShell.tsx`). Aqui os comandos
 * `playNext` e `stop` enviam mutações transacionais à estação (migration 039)
 * via RPC e, em seguida, emitem um sinal mínimo de broadcast — NUNCA a faixa.
 * O Desktop reconsulta `station_get_snapshot` e reconcilia o player local.
 *
 * O gate read-only é aplicado AQUI (nível `full` no app `tv`): um admin de
 * leitura NÃO emite comando de mutação — defesa em profundidade além do gate
 * de FULL no banco (rbac 060).
 */

export interface MusicPlayerCommandValue {
  /** Comando real: resolve a faixa no snapshot e chama station_track_change. */
  playNext: (track: TvMusicTrack) => Promise<void>
  /** Comando STOP: chama station_stop (interrompe a estação do workspace). */
  stop: () => Promise<void>
  /** Comando PAUSE: chama station_pause (preserva faixa e posição). */
  pause: () => Promise<void>
  /** Comando RESUME: chama station_resume (retoma da posição pausada). */
  resume: () => Promise<void>
  /** Comando NEXT: chama station_next (o Station escolhe a próxima faixa). */
  next: () => Promise<void>
  /** Comando PREVIOUS: chama station_previous (o Station escolhe a anterior). */
  previous: () => Promise<void>
  /** Comando SEEK: chama station_seek com a posição em segundos. */
  seek: (positionSeconds: number) => Promise<void>
}

const MusicPlayerCommandCtx = createContext<MusicPlayerCommandValue | null>(null)

// eslint-disable-next-line react/only-export-components
export function useMusicPlayerCommand(): MusicPlayerCommandValue {
  const v = useContext(MusicPlayerCommandCtx)
  if (!v) throw new Error('useMusicPlayerCommand must be used within <MusicPlayerCommandProvider>')
  return v
}

export function MusicPlayerCommandProvider({ children }: { children: ReactNode }) {
  const { getLevel } = useAppAccess()

  // Sinal mínimo p/ o Desktop reconsultar o snapshot (não é autoridade).
  const { send } = useRealtimeBroadcast<StationChangedSignal>(
    'tv-station-sync',
    'station-changed',
    () => {},
    { self: false },
  )

  /** Gate (full) + RPC + sinal mínimo. Compartilhado por playNext/stop. */
  const emit = useCallback(
    async (command: () => Promise<StationCommandOutcome>) => {
      const level = getLevel('tv')
      if (level !== 'full') {
        throw new StationError('ACCESS_DENIED', 'Sem permissão para comandar a estação de música')
      }
      const outcome = await command()
      await send({
        op: 'station_changed',
        workspace_id: outcome.workspace_id,
        request_id: outcome.request_id,
        sequence: outcome.result.state_sequence,
      })
    },
    [getLevel, send],
  )

  const playNext = useCallback((track: TvMusicTrack) => emit(() => playTrackNow(track)), [emit])

  const stop = useCallback(() => emit(stopStation), [emit])

  const pause = useCallback(() => emit(pauseStation), [emit])

  const resume = useCallback(() => emit(resumeStation), [emit])

  const next = useCallback(() => emit(nextStation), [emit])

  const previous = useCallback(() => emit(previousStation), [emit])

  const seek = useCallback((position: number) => emit(() => seekStation(position)), [emit])

  return (
    <MusicPlayerCommandCtx.Provider value={{ playNext, stop, pause, resume, next, previous, seek }}>
      {children}
    </MusicPlayerCommandCtx.Provider>
  )
}