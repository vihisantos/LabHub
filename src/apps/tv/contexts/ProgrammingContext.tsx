/**
 * Contexto de Programação do LabHub TV — modo LOCAL (Tauri Desktop).
 *
 * Zero tráfego Supabase: a fila é construída a partir dos arquivos já
 * sincronizados do Google Drive (services/localProgramming) e o estado é
 * persistido localmente pelos comandos Tauri `programming_state_get/set/reset`
 * (JSON durável em %APPDATA%/LabHub TV/programming-state.json).
 *
 * Regras de programação preservadas do modelo original:
 *   - Conteúdo fixo toca a cada 5 itens acadêmicos (academicSinceLastFixed >= 4).
 *   - Informativo toca a cada 7 itens acadêmicos (academicSinceLastInformativo >= 7).
 *   - Ambos usam filas independentes, determinísticas e persistidas: todos os
 *     arquivos válidos participam antes de uma nova rodada, sem aleatoriedade.
 *   - Um conteúdo só é registrado como assistido quando a mídia termina.
 *   - Fim do ciclo → itens voltam a ficar pendentes e a ordem é reembaralhada;
 *     os contadores acumulados são preservados para as cadências periódicas.
 *   - Todos os vídeos (acadêmicos, fixos e informativos) têm cooldown
 *     individual de 10 minutos; fotos e vinhetas são isentos.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  listLocalMediaWithStatus,
  discoverLocalStructure,
  buildLocalQueue,
  shuffleArray,
  optimizeCourseDistribution,
  localId,
  mediaFingerprint,
  libraryFingerprint,
  type LocalMediaFile,
  type LocalDiscovery,
} from '../services/localProgramming'
import type { ProgrammingQueueItem, TvGallery, TvGalleryPhoto, TvInformativo } from '../types'
import { logRotationSelection } from '../services/rotationLog'
import {
  completeRotationItem,
  emptyRotationState,
  fixedCandidates,
  forgetRotationIds,
  informativoCandidates,
  reconcileRotation,
  recordPlayback,
  selectRotationItem,
  type RotationCandidate,
  type RotationSelection,
  type RotationState,
  type SpecialCategory,
} from '../services/specialRotation'

/* ── Contrato de persistência (espelha ProgrammingState em src-tauri/main.rs) ──
 * Os campos são snake_case porque o struct Rust não usa rename_all: as chaves
 * JSON precisam casar exatamente com o backend Tauri. */
interface TauriProgrammingState {
  cycle: number
  position: number
  academic_completed: number
  academic_since_last_fixed: number
  completed_ids: string[]
  pending_queue: string[]
  next_fixed_id: string | null
  library_version: string | null
  error_contents: string[]
  completed_fixed_ids: string[]
  // Contador de quantos acadêmicos foram exibidos desde o último informativo
  academic_since_last_informativo: number
  /** Rodada de informativos já exibidos (evita repetir o mesmo aviso). */
  completed_informativo_ids: string[]
  /** Histórico individual de reprodução (vídeos de todas as categorias). */
  last_video_played_at?: Record<string, number>
  /** Rodízio determinístico: ordem e posição persistidas por categoria. */
  fixed_round_ids?: string[]
  fixed_round_cursor?: number
  informativo_round_ids?: string[]
  informativo_round_cursor?: number
  next_informativo_id?: string | null
}

function emptyTauriState(): TauriProgrammingState {
  return {
    cycle: 1,
    position: 0,
    academic_completed: 0,
    academic_since_last_fixed: 0,
    completed_ids: [],
    pending_queue: [],
    next_fixed_id: null,
    library_version: null,
    error_contents: [],
    completed_fixed_ids: [],
    academic_since_last_informativo: 0,
    completed_informativo_ids: [],
    last_video_played_at: {},
    fixed_round_ids: [],
    fixed_round_cursor: 0,
    informativo_round_ids: [],
    informativo_round_cursor: 0,
    next_informativo_id: null,
  }
}

/* ── API pública do contexto ────────────────────────────────────────────── */

interface ProgrammingContextValue {
  /** Fila acadêmica local (embaralhada, sem concluídos do ciclo). */
  queue: ProgrammingQueueItem[]
  currentItem: ProgrammingQueueItem | null
  position: number
  academicCompleted: number
  academicSinceLastFixed: number
  /**
   * Total de conteúdos já exibidos na sessão (acadêmico + fixo + informativo).
   * É a base da cadência dos slides especiais (relógio a cada 4, clima a cada 8).
   */
  contentShown: number
  /** Marca que um conteúdo (acadêmico, fixo ou informativo) começou a ser exibido. */
  markContentShown: () => void
  advance: () => void
  markCurrentCompleted: () => void
  /**
   * Conclusão efetiva de um fixo/informativo (fim do vídeo ou do timer da
   * imagem). Só aqui o conteúdo entra no histórico da rodada e recebe cooldown.
   */
  markSpecialContentCompleted: (category: SpecialCategory, id: string) => void
  /** Registra mídia inválida para não repeti-la na próxima rodada. */
  reportMediaFailure: (id: string) => void
  /** Compatibilidade: encerra um informativo pelo ID. */
  resetInformativoCounter: (informativoId?: string) => void
  /** IDs de mídia que falharam ao carregar (fixos/informativos também). */
  failedIds: string[]
  getQueueStats: () => { total: number; completed: number; pending: number }
  /** Conteúdo fixo (Fixos/) — exibido quando isFixedDue. */
  fixedContent: ProgrammingQueueItem[]
  /** Próximo conteúdo fixo da fila determinística (estável durante a fase). */
  nextFixedId: string | null
  /** Fixos já concluídos nesta rodada. */
  completedFixedIds: string[]
  isFixedDue: boolean
  /** Informativos (Informativos/) — fase ocasional. */
  informativos: TvInformativo[]
  /** Próximo informativo da fila determinística (estável durante a fase). */
  nextInformativo: TvInformativo | null
  informativoDue: boolean
  /** Galerias locais (Galerias/) para a fase de fotos. */
  galleries: TvGallery[]
  photosMap: Record<string, TvGalleryPhoto[]>
  /** Carregamento inicial concluído (descoberta + estado). */
  ready: boolean
  /** Erro de descoberta/sincronização (ex.: pasta não configurada). */
  discoveryError: string | null
  /** Biblioteca existe, mas nenhum item acadêmico está elegível (cooldown). */
  isWaitingForEligible: boolean
}

export const LIBRARY_REFRESH_MS = 60_000
export const VIDEO_COOLDOWN_MS = 10 * 60_000
/** 1 fixo a cada 5 acadêmicos: 4 concluídos + 1 exibido. */
export const FIXED_INTERVAL = 4
/** 1 informativo a cada 7 acadêmicos concluídos. */
export const INFORMATIVO_INTERVAL = 7
/** Reavaliação leve durante a espera: sem novo timer por item e sem reinício. */
export const COOLDOWN_RECHECK_MS = 1_000

function isCoolingDown(
  item: ProgrammingQueueItem, history: Record<string, number>, now: number,
): boolean {
  // Esta checagem é só da fila acadêmica: fotos/vinhetas são isentos e fixos/
  // informativos têm cooldown próprio no rodízio determinístico (specialRotation).
  if (item.file_type !== 'video' || item.is_trailer || item.is_fixed) return false
  const last = history[item.id]
  return last !== undefined && now - last < VIDEO_COOLDOWN_MS
}

/**
 * Escolhe o próximo item elegível da fila.
 *
 * - prioriza conteúdo disponível há mais tempo (ou nunca exibido);
 * - evita repetir o curso do item anterior quando há alternativa;
 * - nunca aplica cooldown a imagens, vinhetas ou fixos;
 * - retorna `items.length` quando tudo está bloqueado (o player então usa
 *   relógio/clima sem consumir contadores).
 */
export function nextEligiblePosition(
  items: ProgrammingQueueItem[], start: number, history: Record<string, number>,
  failed: string[], now = Date.now(), avoidCourseId?: string,
): number {
  const eligible: Array<{ index: number; last: number }> = []
  for (let i = start; i < items.length; i++) {
    const item = items[i]
    if (failed.includes(item.id)) continue
    if (isCoolingDown(item, history, now)) continue
    eligible.push({ index: i, last: history[item.id] ?? -Infinity })
  }
  if (eligible.length === 0) return items.length

  const fresh = eligible.filter(({ index }) => items[index].course_id !== avoidCourseId)
  const pool = fresh.length > 0 ? fresh : eligible
  pool.sort((a, b) => a.last - b.last || a.index - b.index)
  return pool[0].index
}

const ProgrammingCtx = createContext<ProgrammingContextValue | null>(null)

// eslint-disable-next-line react/only-export-components
export function useProgramming(): ProgrammingContextValue {
  const v = useContext(ProgrammingCtx)
  if (!v) throw new Error('useProgramming must be used within <ProgrammingProvider>')
  return v
}

export interface ProgrammingProviderProps {
  children: ReactNode
}

/* ── Bridge Tauri ───────────────────────────────────────────────────────── */

/** Único caminho de IPC: API oficial do Tauri 2 (sem global `__TAURI__`). */
function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args)
}

/* ── Provider ───────────────────────────────────────────────────────────── */

export function ProgrammingProvider({ children }: ProgrammingProviderProps) {
  const [queue, setQueue] = useState<ProgrammingQueueItem[]>([])
  const [position, setPosition] = useState(0)
  const historyRef = useRef<Record<string, number>>({})
  const [lastVideoPlayedAt, setLastVideoPlayedAt] = useState<Record<string, number>>({})
  const [academicCompleted, setAcademicCompleted] = useState(0)
  // Conta TODO conteúdo exibido (acadêmico, fixo, informativo). Diferente de
  // academicCompleted, que só conta acadêmicos e serve às regras 5:1 e 7:1.
  const [contentShown, setContentShown] = useState(0)
  const [academicSinceLastFixed, setAcademicSinceLastFixed] = useState(0)
  const [completedIds, setCompletedIds] = useState<string[]>([])
  /** Rodada determinística de fixos: ordem, cursor e concluídos persistidos. */
  const [fixedRotation, setFixedRotation] = useState<RotationState>(emptyRotationState)
  const [nextFixedId, setNextFixedId] = useState<string | null>(null)
  const [libraryVersion, setLibraryVersion] = useState<string | null>(null)
  // Contador de acadêmicos desde o último informativo concluído (7:1).
  const [academicSinceLastInformativo, setAcademicSinceLastInformativo] = useState(0)
  /** Rodada determinística de informativos, independente da de fixos. */
  const [informativoRotation, setInformativoRotation] = useState<RotationState>(emptyRotationState)
  const [nextInformativoId, setNextInformativoId] = useState<string | null>(null)
  /** IDs de mídia que falharam ao carregar — persistidos em `error_contents`. */
  const [failedIds, setFailedIds] = useState<string[]>([])
  /** Falha transitória de leitura da pasta: impede sobrescrever o estado salvo. */
  const [readError, setReadError] = useState<string | null>(null)

  // Espelhos dos estados usados por callbacks periódicos: evitam recriar o
  // intervalo de varredura/cooldown a cada render e leem sempre o valor atual.
  const queueRef = useRef(queue)
  queueRef.current = queue
  const positionRef = useRef(position)
  positionRef.current = position
  const failedIdsRef = useRef(failedIds)
  failedIdsRef.current = failedIds
  const fixedRotationRef = useRef(fixedRotation)
  fixedRotationRef.current = fixedRotation
  const informativoRotationRef = useRef(informativoRotation)
  informativoRotationRef.current = informativoRotation
  const nextFixedIdRef = useRef(nextFixedId)
  nextFixedIdRef.current = nextFixedId
  const nextInformativoIdRef = useRef(nextInformativoId)
  nextInformativoIdRef.current = nextInformativoId
  const academicSinceLastFixedRef = useRef(academicSinceLastFixed)
  academicSinceLastFixedRef.current = academicSinceLastFixed
  const academicSinceLastInformativoRef = useRef(academicSinceLastInformativo)
  academicSinceLastInformativoRef.current = academicSinceLastInformativo
  const readyRef = useRef(false)
  const readErrorRef = useRef(readError)
  readErrorRef.current = readError
  const lastRotationLogRef = useRef<Record<string, string>>({})

  const [fixedContent, setFixedContent] = useState<ProgrammingQueueItem[]>([])
  const [informativos, setInformativos] = useState<TvInformativo[]>([])
  const [galleries, setGalleries] = useState<TvGallery[]>([])
  const [photosMap, setPhotosMap] = useState<Record<string, TvGalleryPhoto[]>>({})

  const [ready, setReady] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const fixedContentRef = useRef(fixedContent)
  fixedContentRef.current = fixedContent
  const informativosRef = useRef(informativos)
  informativosRef.current = informativos
  readyRef.current = ready

  /** Guarda a descoberta atual para reconstruir a fila pelo pending_queue. */
  const discoveryRef = useRef<LocalDiscovery | null>(null)
  const appliedFilesRef = useRef<LocalMediaFile[]>([])
  const pendingFilesRef = useRef<LocalMediaFile[] | null>(null)
  const candidateFingerprintRef = useRef<string | null>(null)
  const [initialRetry, setInitialRetry] = useState(0)

  /* Persistência local (comandos Tauri; falham silenciosamente fora do app). */
  const persistState = useCallback(function(state: TauriProgrammingState) {
    tauriInvoke<void>('programming_state_set', { state }).catch((e) => {
      console.warn('[Programming] falha ao persistir estado local:', e)
    })
  }, [])

  const loadPersistedState = useCallback(async function(): Promise<TauriProgrammingState | null> {
    try {
      const state = await tauriInvoke<TauriProgrammingState>('programming_state_get')
      return state ?? null
    } catch {
      return null
    }
  }, [])

  /** Estado de rodízio persistido, reconciliado com os arquivos agora válidos. */
  const restoreRotation = useCallback(function(
    saved: TauriProgrammingState | null,
    candidates: RotationCandidate[],
    category: SpecialCategory,
  ): RotationState {
    const roundIds = category === 'fixed'
      ? saved?.fixed_round_ids ?? []
      : saved?.informativo_round_ids ?? []
    const cursor = category === 'fixed'
      ? saved?.fixed_round_cursor ?? 0
      : saved?.informativo_round_cursor ?? 0
    const playedIds = category === 'fixed'
      ? saved?.completed_fixed_ids ?? []
      : saved?.completed_informativo_ids ?? []
    return reconcileRotation({ roundIds, cursor, playedIds }, candidates)
  }, [])

  /** Reconstrói a fila a partir de pending_queue persistido + descoberta atual. */
  const rebuildQueueFromIds = useCallback(function(
    pendingQueue: string[],
    failed: string[],
  ): ProgrammingQueueItem[] {
    const discovery = discoveryRef.current
    if (!discovery) return []
    const byId = new Map<string, ProgrammingQueueItem>()

    // Índice de todos os itens possíveis (vinheta + conteúdos por curso).
    const items: ProgrammingQueueItem[] = buildLocalQueue(discovery.courses, [])
      .filter(function(i) { return !failed.includes(i.id) })
    for (const item of items) byId.set(item.id, item)

    const restored: ProgrammingQueueItem[] = []
    for (const id of pendingQueue) {
      const item = byId.get(id)
      if (item) restored.push(item)
    }
    // Conteúdos novos desde o último save entram no fim da fila.
    for (const item of items) {
      if (!pendingQueue.includes(item.id)) restored.push(item)
    }
    return restored
  }, [])

  /* ── Carregamento inicial: descoberta local + estado persistido ── */
  useEffect(function() {
    let cancelled = false
    const loadInitialData = async function() {
      try {
        const { files, error } = await listLocalMediaWithStatus()
        if (cancelled) return
        const saved = await loadPersistedState()
        if (cancelled) return
        historyRef.current = saved?.last_video_played_at ?? {}
        setLastVideoPlayedAt(historyRef.current)

        if (error) {
          // Pasta indisponível NÃO é biblioteca vazia: preserva o estado salvo
          // e bloqueia gravações até uma leitura bem-sucedida.
          setReadError(error)
          setDiscoveryError('Não foi possível ler a pasta do Drive. O último estado válido foi preservado.')
          if (saved) {
            setFailedIds(saved.error_contents ?? [])
            setPosition(saved.position ?? 0)
            setAcademicCompleted(saved.academic_completed ?? 0)
            setAcademicSinceLastFixed(saved.academic_since_last_fixed ?? 0)
            setCompletedIds(saved.completed_ids ?? [])
            setNextFixedId(saved.next_fixed_id ?? null)
            setLibraryVersion(saved.library_version ?? null)
            setFixedRotation({
              roundIds: saved.fixed_round_ids ?? [],
              cursor: saved.fixed_round_cursor ?? 0,
              playedIds: saved.completed_fixed_ids ?? [],
            })
            setAcademicSinceLastInformativo(saved.academic_since_last_informativo ?? 0)
            setInformativoRotation({
              roundIds: saved.informativo_round_ids ?? [],
              cursor: saved.informativo_round_cursor ?? 0,
              playedIds: saved.completed_informativo_ids ?? [],
            })
            setNextInformativoId(saved.next_informativo_id ?? null)
          }
          // Sem descoberta não há itens para reconstruir, mas o player precisa
          // sair do "carregando": a tela de manutenção orienta o operador.
          setReady(true)
          return
        }

        setReadError(null)
        const discovery = discoverLocalStructure(files)
        discoveryRef.current = discovery
        appliedFilesRef.current = files
        pendingFilesRef.current = null
        candidateFingerprintRef.current = null

        const fixedItems = discovery.fixed.map(toFixedItem)
        setFixedContent(fixedItems)
        setInformativos(discovery.informativos)
        setGalleries(discovery.galleries)
        setPhotosMap(discovery.photosMap)
        // Ordem/cursor restaurados por categoria; arquivos novos entram no fim.
        const savedFixedRotation = restoreRotation(saved, fixedCandidates(fixedItems), 'fixed')
        const savedInformativoRotation = restoreRotation(saved, informativoCandidates(discovery.informativos), 'informativo')
        const freshFixedRotation = restoreRotation(null, fixedCandidates(fixedItems), 'fixed')
        const freshInformativoRotation = restoreRotation(null, informativoCandidates(discovery.informativos), 'informativo')

        /** Seleção inicial já no primeiro render: a cadência não perde um ciclo. */
        const initialSpecialState = function(
          rotation: RotationState,
          candidates: RotationCandidate[],
          failures: string[],
          due: boolean,
        ) {
          if (!due) return { rotation, id: null }
          const selection = selectRotationItem(
            rotation, candidates, historyRef.current, failures, Date.now(), VIDEO_COOLDOWN_MS,
          )
          return { rotation: selection.state, id: selection.id }
        }

        if (discovery.totalContents === 0 && discovery.totalFixed === 0 && discovery.informativos.length === 0 && discovery.galleries.length === 0) {
          setDiscoveryError(
            'Nenhum conteúdo encontrado na pasta sincronizada do Drive. ' +
            'Verifique a pasta em Ctrl+Alt+K → Manutenção.',
          )
        } else {
          setDiscoveryError(null)
        }

        const queueValid = !!saved
          && Array.isArray(saved.pending_queue)
          && saved.pending_queue.length > 0

        // Um arquivo reparado enquanto o app estava desligado não pode ficar
        // preso em error_contents para sempre: modifiedAt posterior ao último
        // save prova que houve alteração desde a falha registrada.
        const savedAt = saved?.library_version ? Date.parse(saved.library_version) : NaN
        const restoredFailed = (saved?.error_contents ?? []).filter(function(id) {
          if (!Number.isFinite(savedAt)) return true
          const file = files.find(function(f) { return localId(f.path) === id })
          return !(file?.modifiedAt && file.modifiedAt > savedAt)
        })
        setFailedIds(restoredFailed)

        if (saved && queueValid && saved.library_version) {
          // Retomada: restaura contadores e reconstrói a fila pelos IDs.
          const restored = rebuildQueueFromIds(saved.pending_queue, restoredFailed)
          if (restored.length > 0) {
            setQueue(restored)
            const start = Math.min(saved.position, restored.length)
            let eligible = nextEligiblePosition(restored, start, historyRef.current, restoredFailed)
            if (eligible === restored.length) eligible = nextEligiblePosition(restored, 0, historyRef.current, restoredFailed)
            setPosition(eligible)
            setAcademicCompleted(saved.academic_completed ?? 0)
            setCompletedIds(saved.completed_ids ?? [])
            setLibraryVersion(saved.library_version)

            // Se o app fechou depois do fim da mídia mas antes do limite da
            // sequência, a conclusão já está em playedIds: liquida a cadência
            // aqui para não exibir o mesmo arquivo duas vezes na retomada.
            const fixedConcluded = !!saved.next_fixed_id
              && savedFixedRotation.playedIds.includes(saved.next_fixed_id)
            const informativoConcluded = !!saved.next_informativo_id
              && savedInformativoRotation.playedIds.includes(saved.next_informativo_id)
            const fixedCounter = fixedConcluded ? 0 : (saved.academic_since_last_fixed ?? 0)
            const informativoCounter = informativoConcluded ? 0 : (saved.academic_since_last_informativo ?? 0)

            const fixedStart = initialSpecialState(
              savedFixedRotation, fixedCandidates(fixedItems), restoredFailed,
              fixedCounter >= FIXED_INTERVAL
                && fixedItems.some(function(f) { return !restoredFailed.includes(f.id) }),
            )
            const informativoStart = initialSpecialState(
              savedInformativoRotation, informativoCandidates(discovery.informativos), restoredFailed,
              informativoCounter >= INFORMATIVO_INTERVAL
                && discovery.informativos.some(function(i) { return !restoredFailed.includes(i.id) }),
            )
            setFixedRotation(fixedStart.rotation)
            setInformativoRotation(informativoStart.rotation)
            setNextFixedId(fixedStart.id)
            setNextInformativoId(informativoStart.id)
            setAcademicSinceLastFixed(fixedCounter)
            setAcademicSinceLastInformativo(informativoCounter)
            setReady(true)
            return
          }
        }

        // Primeira execução (ou biblioteca mudou): nova fila + novo ciclo.
        const newQueue = buildLocalQueue(discovery.courses, restoredFailed)
        const version = new Date().toISOString()
        setQueue(newQueue)
        setPosition(nextEligiblePosition(newQueue, 0, historyRef.current, restoredFailed))
        setAcademicCompleted(0)
        setAcademicSinceLastFixed(0)
        setCompletedIds([])
        setAcademicSinceLastInformativo(0)
        setFixedRotation(freshFixedRotation)
        setInformativoRotation(freshInformativoRotation)
        setNextFixedId(null)
        setNextInformativoId(null)
        setLibraryVersion(version)
        persistState({
          ...emptyTauriState(),
          pending_queue: newQueue.map(function(i) { return i.id }),
          library_version: version,
          error_contents: restoredFailed,
          last_video_played_at: historyRef.current,
          fixed_round_ids: freshFixedRotation.roundIds,
          fixed_round_cursor: freshFixedRotation.cursor,
          completed_fixed_ids: freshFixedRotation.playedIds,
          informativo_round_ids: freshInformativoRotation.roundIds,
          informativo_round_cursor: freshInformativoRotation.cursor,
          completed_informativo_ids: freshInformativoRotation.playedIds,
        })
      } catch (e) {
        console.error('[Programming] erro no carregamento local:', e)
        setDiscoveryError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    function toFixedItem(f: { id: string; file_path: string; file_name: string; file_type: 'video' | 'image'; duration_seconds: number }): ProgrammingQueueItem {
      return {
        id: f.id,
        type: 'fixed',
        file_path: f.file_path,
        file_name: f.file_name,
        file_type: f.file_type,
        duration_seconds: f.duration_seconds,
        is_trailer: false,
        is_fixed: true,
      }
    }

    void loadInitialData()
    return function() { cancelled = true }
  }, [loadPersistedState, persistState, restoreRotation, rebuildQueueFromIds, initialRetry])

  // Só descobre em segundo plano. A troca de fila acontece em advance(),
  // chamado pela TV ao terminar a sequência de fases em andamento.
  useEffect(function() {
    if (!ready) return
    let cancelled = false
    let busy = false
    const poll = async function() {
      if (busy) return
      if (!discoveryRef.current) { setInitialRetry(n => n + 1); return }
      busy = true
      try {
        const result = await listLocalMediaWithStatus()
        if (cancelled) return
        if (result.error) {
          candidateFingerprintRef.current = null
          pendingFilesRef.current = null
          return // erro transitório: não altera fila, contadores ou estado salvo
        }
        const signature = libraryFingerprint(result.files)
        if (signature === libraryFingerprint(appliedFilesRef.current)) {
          pendingFilesRef.current = null
          candidateFingerprintRef.current = null
          return
        }
        // Duas leituras iguais reduzem risco de inserir um download incompleto.
        if (signature === candidateFingerprintRef.current) {
          pendingFilesRef.current = result.files
        } else {
          candidateFingerprintRef.current = signature
          pendingFilesRef.current = null
        }
      } finally { busy = false }
    }
    const timer = window.setInterval(() => { void poll() }, LIBRARY_REFRESH_MS)
    return function() { cancelled = true; window.clearInterval(timer) }
  }, [ready])

  /* ── Ações ────────────────────────────────────────────────────────────── */

  const markContentShown = useCallback(function() {
    setContentShown(function(prev) { return prev + 1 })
  }, [])

  /** Mídia quebrada é excluída da próxima rodada, sem alterar a contagem atual. */
  const reportMediaFailure = useCallback(function(id: string) {
    setFailedIds(function(prev) { return prev.includes(id) ? prev : [...prev, id] })
  }, [])

  /**
   * Aplica uma alteração já confirmada do Drive. Pode ser chamada no limite da
   * sequência (`advance`) ou durante a espera por cooldown, quando não há
   * vídeo acadêmico em reprodução para ser interrompido.
   */
  const applyPendingLibrary = useCallback(function(): boolean {
    const pending = pendingFilesRef.current
    if (!pending) return false
    pendingFilesRef.current = null
    candidateFingerprintRef.current = null
    const currentQueue = queueRef.current
    const currentPosition = positionRef.current
    const knownFailures = failedIdsRef.current
    const previous = new Map(appliedFilesRef.current.map(f => [f.path, mediaFingerprint(f)]))
    const changed = new Set(pending.filter(f => previous.get(f.path) !== mediaFingerprint(f)).map(f => localId(f.path)))
    const survivingIds = new Set(pending.map(f => localId(f.path)))
    const failures = knownFailures.filter(id => survivingIds.has(id) && !changed.has(id))
    const discovery = discoverLocalStructure(pending)
    discoveryRef.current = discovery
    appliedFilesRef.current = pending
    setFailedIds(failures)
    const nextFixed = discovery.fixed.map((f): ProgrammingQueueItem => ({
      id: f.id, type: 'fixed', file_path: f.file_path, file_name: f.file_name,
      file_type: f.file_type, duration_seconds: f.duration_seconds, is_trailer: false, is_fixed: true,
    }))
    setFixedContent(nextFixed)
    setInformativos(discovery.informativos)
    // Novos arquivos entram no fim da rodada; alterados perdem o histórico.
    const fixedIds = fixedCandidates(nextFixed)
    const infoIds = informativoCandidates(discovery.informativos)
    const nextFixedRotation = reconcileRotation(
      forgetRotationIds(fixedRotationRef.current, [...changed]), fixedIds,
    )
    const nextInformativoRotation = reconcileRotation(
      forgetRotationIds(informativoRotationRef.current, [...changed]), infoIds,
    )
    fixedRotationRef.current = nextFixedRotation
    informativoRotationRef.current = nextInformativoRotation
    setFixedRotation(nextFixedRotation)
    setInformativoRotation(nextInformativoRotation)
    if (nextFixedIdRef.current && !nextFixedRotation.roundIds.includes(nextFixedIdRef.current)) setNextFixedId(null)
    if (nextInformativoIdRef.current && !nextInformativoRotation.roundIds.includes(nextInformativoIdRef.current)) setNextInformativoId(null)
    setGalleries(discovery.galleries)
    setPhotosMap(discovery.photosMap)
    setDiscoveryError(discovery.totalContents === 0 && discovery.totalFixed === 0 && discovery.informativos.length === 0 && discovery.galleries.length === 0
      ? 'Nenhum conteúdo encontrado na pasta sincronizada do Drive.' : null)
    setLibraryVersion(new Date().toISOString())
    const available = buildLocalQueue(discovery.courses, failures)
    const byId = new Map(available.map(item => [item.id, item]))
    const oldIds = new Set(currentQueue.map(item => item.id))
    const before = currentQueue.slice(0, currentPosition + 1).flatMap(item => byId.has(item.id) ? [byId.get(item.id)!] : [])
    const after = currentQueue.slice(currentPosition + 1).flatMap(item => byId.has(item.id) ? [byId.get(item.id)!] : [])
    const additions = available.filter(item => !oldIds.has(item.id))
    const lastCourseId = before[before.length - 1]?.course_id
    if (after.length + additions.length > 0) {
      const merged = [...before, ...after, ...additions]
      setQueue(merged)
      const eligible = nextEligiblePosition(merged, before.length, historyRef.current, failures, Date.now(), lastCourseId)
      if (eligible < merged.length) {
        setPosition(eligible)
        setCompletedIds(ids => ids.filter(id => byId.has(id)))
      } else {
        setQueue(available)
        setPosition(nextEligiblePosition(available, 0, historyRef.current, failures))
        setCompletedIds([])
      }
    } else {
      const last = currentQueue[currentPosition]?.id
      if (available.length > 1 && available[0].id === last) {
        available.push(available.shift()!)
      }
      setQueue(available)
      setPosition(nextEligiblePosition(available, 0, historyRef.current, failures, Date.now(), lastCourseId))
      setCompletedIds([])
    }
    return true
  }, [])

  const advance = useCallback(function() {
    if (applyPendingLibrary()) return
    const currentQueue = queueRef.current
    const currentPosition = positionRef.current
    const knownFailures = failedIdsRef.current
    if (currentQueue.length === 0) {
      setPosition(0)
      return
    }

    const next = nextEligiblePosition(
      currentQueue, currentPosition + 1, historyRef.current, knownFailures, Date.now(), currentQueue[currentPosition]?.course_id,
    )
    if (next < currentQueue.length) {
      setPosition(next)
      return
    }

    // Fim do ciclo: reinicia a repetição dos itens (completedIds), mas preserva
    // os contadores acumulados. Zerá-los aqui fazia as cadências periódicas
    // nunca dispararem em bibliotecas menores que o intervalo (ex.: 1 vídeo →
    // comercial 5:1, informativo 7:1, relógio 4 e clima 8 jamais apareciam).
    setCompletedIds([])

    // Nova rodada com ordem diferente: sem isso a TV repetiria exatamente a
    // mesma sequência em todos os ciclos.
    const playable = currentQueue.filter(function(i) { return !knownFailures.includes(i.id) })
    // Remove definitivamente a mídia quebrada mesmo quando só um item resta.
    if (playable.length !== currentQueue.length) {
      setQueue(playable)
    }
    if (playable.length > 1) {
      const lastPlayed = playable[playable.length - 1]
      const newOrder = optimizeCourseDistribution(shuffleArray(playable))
      // Evita começar a rodada com o conteúdo que acabou de tocar.
      if (newOrder[0].id === lastPlayed.id) {
        const swapIdx = newOrder.findIndex(function(i) { return i.id !== lastPlayed.id })
        if (swapIdx > 0) {
          const first = newOrder[0]
          newOrder[0] = newOrder[swapIdx]
          newOrder[swapIdx] = first
        }
      }
      setQueue(newOrder)
      setPosition(nextEligiblePosition(newOrder, 0, historyRef.current, knownFailures))
    } else {
      setPosition(nextEligiblePosition(playable, 0, historyRef.current, knownFailures))
    }
  }, [applyPendingLibrary])

  /**
   * Durante a espera, reaplica mudanças confirmadas e verifica se o cooldown
   * liberou algum vídeo. Não toca contadores nem avança a fila: apenas escolhe
   * o primeiro item elegível para retomar a programação.
   */
  const resumeFromIdle = useCallback(function() {
    if (applyPendingLibrary()) return
    const currentQueue = queueRef.current
    if (currentQueue.length === 0 || currentQueue[positionRef.current]) return
    const eligible = nextEligiblePosition(
      currentQueue, 0, historyRef.current, failedIdsRef.current, Date.now(),
    )
    if (eligible < currentQueue.length && eligible !== positionRef.current) {
      setPosition(eligible)
    }
  }, [applyPendingLibrary])

  const playableFixed = useMemo(
    function() { return fixedContent.filter(function(f) { return !failedIds.includes(f.id) }) },
    [fixedContent, failedIds],
  )

  /**
   * Mantém as duas filas independentes atualizadas. A escolha só muda quando o
   * agendado desaparece, falha ou entra em cooldown — nunca no meio de uma
   * reprodução. Se nada estiver elegível, a pendência permanece (contador
   * ligado, sem registrar conclusão) para a próxima oportunidade.
   */
  const reevaluateSpecialSelection = useCallback(function(fixedDue: boolean, informativoDue: boolean) {
    if (!readyRef.current || readErrorRef.current) return
    const now = Date.now()
    const history = historyRef.current
    const failures = failedIdsRef.current

    function candidatesForRotation(state: RotationState, candidates: RotationCandidate[]): RotationCandidate[] {
      const positions = new Map(candidates.map(function(c) { return [c.id, c] }))
      const ordered = state.roundIds
        .map(function(id) { return positions.get(id) })
        .filter(function(c): c is RotationCandidate { return !!c })
      for (const c of candidates) {
        if (!state.roundIds.includes(c.id)) ordered.push(c)
      }
      return ordered
    }

    function logSelection(category: SpecialCategory, chosen: RotationCandidate | undefined, selection: RotationSelection) {
      const key = category + '|' + (selection.id ?? '-') + '|' + selection.reason
      if (key === lastRotationLogRef.current[key]) return
      lastRotationLogRef.current[key] = key
      logRotationSelection({
        category,
        name: chosen?.name ?? '(sem arquivo elegível)',
        lastPlayed: selection.id ? history[selection.id] : undefined,
        cooldownMs: VIDEO_COOLDOWN_MS,
        reason: selection.reason,
      })
    }

    function evaluate(
      category: SpecialCategory,
      rotationRef: { current: RotationState },
      candidatesIn: RotationCandidate[],
      scheduled: string | null,
      setRotation: (state: RotationState) => void,
      schedule: (id: string | null) => void,
      due: boolean,
    ) {
      // Sem cadência vencida não há fase especial: não agenda nem registra log.
      if (!due) {
        if (scheduled !== null) schedule(null)
        return
      }
      const candidates = candidatesForRotation(rotationRef.current, candidatesIn)
      // Já concluído nesta sequência: mantém o agendamento até o limite, senão
      // a recomposição das fases pularia vinhetas/clima/relógio no meio da mídia.
      if (scheduled && rotationRef.current.playedIds.includes(scheduled)) return
      const current = candidates.find(function(c) { return c.id === scheduled && !failures.includes(scheduled) })
      if (current) {
        const lastScheduled = history[current.id]
        const cooling = current.type === 'video' && lastScheduled !== undefined && now - lastScheduled < VIDEO_COOLDOWN_MS
        if (!cooling) return
        // Enquanto espera, procura outro elegível em vez de insistir no mesmo.
        // Se não houver nenhum, o próprio agendamento permanece como pendência.
      }

      const selection = selectRotationItem(rotationRef.current, candidates, history, failures, now, VIDEO_COOLDOWN_MS)
      const blocked = !selection.id && current && current.type === 'video'
        && history[current.id] !== undefined && now - history[current.id] < VIDEO_COOLDOWN_MS
      if (blocked) {
        const release = new Date(history[current.id] + VIDEO_COOLDOWN_MS).toISOString()
        logRotationSelection({
          category,
          name: current.name,
          lastPlayed: history[current.id],
          cooldownMs: VIDEO_COOLDOWN_MS,
          reason: `pendência preservada — nenhum outro elegível; ${current.name} libera às ${release}`,
        })
        return
      }
      if (selection.state !== rotationRef.current) {
        rotationRef.current = selection.state
        setRotation(selection.state)
      }
      if (selection.id !== scheduled) schedule(selection.id)
      logSelection(category, candidates.find(function(c) { return c.id === selection.id }), selection)
    }

    evaluate(
      'fixed', fixedRotationRef, fixedCandidates(fixedContentRef.current),
      nextFixedIdRef.current, setFixedRotation,
      function(id) { nextFixedIdRef.current = id; setNextFixedId(id) },
      fixedDue,
    )
    evaluate(
      'informativo', informativoRotationRef, informativoCandidates(informativosRef.current),
      nextInformativoIdRef.current, setInformativoRotation,
      function(id) { nextInformativoIdRef.current = id; setNextInformativoId(id) },
      informativoDue,
    )
  }, [])

  /** Conclusão efetiva: só aqui a mídia entra no histórico e no cooldown. */
  const markSpecialContentCompleted = useCallback(function(category: SpecialCategory, id: string) {
    const now = Date.now()
    const candidates = category === 'fixed'
      ? fixedCandidates(fixedContentRef.current)
      : informativoCandidates(informativosRef.current)
    const item = candidates.find(function(c) { return c.id === id })
    if (!item) return

    if (item.type === 'video') {
      historyRef.current = recordPlayback(historyRef.current, id, 'video', now, VIDEO_COOLDOWN_MS)
      setLastVideoPlayedAt(historyRef.current)
    }
    const rotationRef = category === 'fixed' ? fixedRotationRef : informativoRotationRef
    const setRotation = category === 'fixed' ? setFixedRotation : setInformativoRotation
    const next = completeRotationItem(rotationRef.current, id)
    rotationRef.current = next
    setRotation(next)

    // A cadência NÃO é zerada aqui: o agendamento continua travado até o limite
    // da sequência para que trocar de item não recomponha as fases no meio da
    // reprodução (isso pularia vinheta, clima ou relógio).
    logRotationSelection({
      category,
      name: item.name,
      lastPlayed: now,
      cooldownMs: VIDEO_COOLDOWN_MS,
      reason: 'conclusão efetiva registrada — próximo liberado no limite da sequência',
    })
  }, [])

  /** Libera a cadência no limite da sequência (após a última fase). */
  const finishSpecialSequence = useCallback(function(category: SpecialCategory) {
    if (category === 'fixed') {
      setAcademicSinceLastFixed(0)
      nextFixedIdRef.current = null
      setNextFixedId(null)
    } else {
      setAcademicSinceLastInformativo(0)
      nextInformativoIdRef.current = null
      setNextInformativoId(null)
    }
  }, [])

  const markCurrentCompleted = useCallback(function() {
    // Limite da sequência: só agora a cadência é zerada. O conteúdo especial
    // já foi registrado no fim de sua própria mídia (playedIds + cooldown).
    if (nextFixedIdRef.current && fixedRotationRef.current.playedIds.includes(nextFixedIdRef.current)) {
      finishSpecialSequence('fixed')
    }
    if (
      nextInformativoIdRef.current
      && informativoRotationRef.current.playedIds.includes(nextInformativoIdRef.current)
    ) {
      finishSpecialSequence('informativo')
    }

    const current = queue[position]
    // Durante o fallback de cooldown não há conteúdo acadêmico em andamento:
    // relógio/clima não podem consumir contadores nem avançar a fila. Ainda
    // assim, este é um limite seguro para aplicar mudanças do Drive e retomar
    // assim que houver item elegível — sem exigir reinício do aplicativo.
    if (!current) {
      resumeFromIdle()
      return
    }
    // Falha de mídia não conta como conteúdo assistido nem entra em `completedIds`.
    if (failedIds.includes(current.id)) {
      advance()
      return
    }
    {
      if (!current.is_fixed) {
        if (current.file_type === 'video' && !current.is_trailer) {
          historyRef.current = recordPlayback(historyRef.current, current.id, 'video', Date.now(), VIDEO_COOLDOWN_MS)
          setLastVideoPlayedAt(historyRef.current)
        }
        setCompletedIds(function(prev) { return [...prev, current.id] })
        setAcademicCompleted(function(prev) { return prev + 1 })
        // As cadências só zeram na CONCLUSÃO do fixo/informativo (abaixo),
        // nunca aqui: assim a pendência sobrevive a cooldown e a falhas.
        setAcademicSinceLastFixed(function(prev) { return prev + 1 })
        setAcademicSinceLastInformativo(function(prev) { return prev + 1 })
      }
    }
    advance()
  }, [queue, position, advance, failedIds, resumeFromIdle, finishSpecialSequence])

  /** Compatibilidade com o player antigo: conclui o informativo pelo ID. */
  const resetInformativoCounter = useCallback(function(informativoId?: string) {
    if (informativoId) {
      markSpecialContentCompleted('informativo', informativoId)
      finishSpecialSequence('informativo')
      return
    }
    setAcademicSinceLastInformativo(0)
  }, [markSpecialContentCompleted, finishSpecialSequence])

  const getQueueStats = useCallback(function() {
    return {
      total: queue.length,
      completed: completedIds.length,
      pending: queue.length - completedIds.length,
    }
  }, [queue.length, completedIds.length])

  /* ── Derivados ────────────────────────────────────────────────────────── */

  const currentItem = queue[position] ?? null
  const isFixedDue = academicSinceLastFixed >= FIXED_INTERVAL && playableFixed.length > 0
  // Mantém a escolha durante a sequência; re-render do relógio ou do contador
  // não pode substituir a mídia no meio da reprodução. Mídia que falhou é
  // excluída para não travar a cadência num aviso inválido.
  const playableInformativos = useMemo(
    function() {
      return informativos.filter(function(i) { return !failedIds.includes(i.id) })
    },
    [informativos, failedIds],
  )
  const nextInformativo = useMemo(
    function() {
      return informativos.find(function(i) {
        return i.id === nextInformativoId && !failedIds.includes(i.id)
      }) ?? null
    },
    [informativos, nextInformativoId, failedIds],
  )
  const completedFixedIds = fixedRotation.playedIds
  const completedInformativoIds = informativoRotation.playedIds
  const informativoDue = (
    playableInformativos.length > 0 &&
    queue.length > 0 &&
    academicSinceLastInformativo >= INFORMATIVO_INTERVAL
  )
  /** Há biblioteca, mas o cooldown bloqueou todos os itens: modo de espera. */
  const isWaitingForEligible = ready && queue.length > 0 && currentItem === null
  /** Cadência pendente sem arquivo agendado (ex.: todos em cooldown). */
  const specialPending = (isFixedDue && !nextFixedId) || (informativoDue && !nextInformativoId)
  const isFixedDueRef = useRef(isFixedDue)
  isFixedDueRef.current = isFixedDue
  const informativoDueRef = useRef(informativoDue)
  informativoDueRef.current = informativoDue

  // Escolha determinística: reavalia quando a cadência, a biblioteca, o
  // histórico ou a agenda mudam. Um agendado válido nunca é substituído aqui.
  useEffect(function() {
    reevaluateSpecialSelection(isFixedDue, informativoDue)
  }, [
    reevaluateSpecialSelection, ready, readError, academicSinceLastFixed,
    academicSinceLastInformativo, fixedContent, informativos, lastVideoPlayedAt,
    failedIds, nextFixedId, nextInformativoId, fixedRotation, informativoRotation,
    isFixedDue, informativoDue,
  ])

  // Um único intervalo leve cobre a espera por cooldown e pendências de fixos
  // e informativos bloqueados. Não cria timers por conteúdo e não interrompe
  // nenhuma mídia em reprodução.
  useEffect(function() {
    if (!ready || readError || (currentItem !== null && !specialPending)) return
    const timer = window.setInterval(function() {
      if (!queueRef.current[positionRef.current]) resumeFromIdle()
      reevaluateSpecialSelection(isFixedDueRef.current, informativoDueRef.current)
    }, COOLDOWN_RECHECK_MS)
    return function() { window.clearInterval(timer) }
  }, [ready, readError, currentItem, specialPending, resumeFromIdle, reevaluateSpecialSelection])

  /* ── Salvamento periódico do estado (JSON durável local) ── */
  useEffect(function() {
    // Enquanto a leitura da pasta falha, gravar aqui apagaria o ponto de retomada.
    if (!ready || readError) return
    persistState({
      cycle: 1,
      position,
      academic_completed: academicCompleted,
      academic_since_last_fixed: academicSinceLastFixed,
      completed_ids: completedIds,
      pending_queue: queue.map(function(i) { return i.id }),
      next_fixed_id: nextFixedId,
      library_version: libraryVersion,
      error_contents: failedIds,
      completed_fixed_ids: completedFixedIds,
      academic_since_last_informativo: academicSinceLastInformativo,
      completed_informativo_ids: completedInformativoIds,
      last_video_played_at: lastVideoPlayedAt,
      fixed_round_ids: fixedRotation.roundIds,
      fixed_round_cursor: fixedRotation.cursor,
      informativo_round_ids: informativoRotation.roundIds,
      informativo_round_cursor: informativoRotation.cursor,
      next_informativo_id: nextInformativoId,
    })
  }, [ready, readError, position, academicCompleted, academicSinceLastFixed, completedIds, queue, nextFixedId, libraryVersion, persistState, failedIds, completedFixedIds, academicSinceLastInformativo, completedInformativoIds, lastVideoPlayedAt, fixedRotation, informativoRotation, nextInformativoId])

  const value: ProgrammingContextValue = {
    queue,
    currentItem,
    position,
    academicCompleted,
    academicSinceLastFixed,
    contentShown,
    markContentShown,
    advance,
    markCurrentCompleted,
    markSpecialContentCompleted,
    reportMediaFailure,
    resetInformativoCounter,
    failedIds,
    getQueueStats,
    fixedContent,
    nextFixedId,
    completedFixedIds,
    isFixedDue,
    informativos,
    nextInformativo,
    informativoDue,
    galleries,
    photosMap,
    ready,
    discoveryError,
    isWaitingForEligible,
  }

  return (
    <ProgrammingCtx.Provider value={value}>
      {children}
    </ProgrammingCtx.Provider>
  )
}

/** Reexporta o utilitário de ID local (consumidores de fixtures/testes). */
export { localId as localContentId }
