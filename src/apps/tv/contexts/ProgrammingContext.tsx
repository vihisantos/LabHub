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
 *   - Informativo toca a cada 7 itens acadêmicos (academicSinceLastInformativo >= 7),
 *     sem repetir o mesmo aviso dentro da rodada.
 *   - Fim do ciclo → itens voltam a ficar pendentes e a ordem é reembaralhada;
 *     os contadores acumulados são preservados para as cadências periódicas.
 *   - Vídeos acadêmicos têm cooldown individual de 10 minutos; fotos, vinhetas,
 *     fixos e informativos são isentos (cada um segue sua própria regra).
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
  last_video_played_at?: Record<string, number>
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
  /** Registra mídia inválida para não repeti-la na próxima rodada. */
  reportMediaFailure: (id: string) => void
  /** Encerra um informativo: zera o contador e registra o ID na rodada atual. */
  resetInformativoCounter: (informativoId?: string) => void
  /** IDs de mídia que falharam ao carregar (fixos/informativos também). */
  failedIds: string[]
  getQueueStats: () => { total: number; completed: number; pending: number }
  /** Conteúdo fixo (Fixos/) — exibido quando isFixedDue. */
  fixedContent: ProgrammingQueueItem[]
  /** Próximo conteúdo fixo escolhido (aleatório entre disponíveis). */
  nextFixedId: string | null
  /** Histórico da rodada atual de fixos (sem repetição antes de esgotar a pasta). */
  completedFixedIds: string[]
  isFixedDue: boolean
  /** Informativos (Informativos/) — fase ocasional. */
  informativos: TvInformativo[]
  nextInformativo: TvInformativo | null
  informativoDue: boolean
  /** Galerias locais (Galerias/) para a fase de fotos. */
  galleries: TvGallery[]
  photosMap: Record<string, TvGalleryPhoto[]>
  /** Carregamento inicial concluído (descoberta + estado). */
  ready: boolean
  /** Erro de descoberta/sincronização (ex.: pasta não configurada). */
  discoveryError: string | null
}

export const LIBRARY_REFRESH_MS = 60_000
export const VIDEO_COOLDOWN_MS = 10 * 60_000

function isCoolingDown(
  item: ProgrammingQueueItem, history: Record<string, number>, now: number,
): boolean {
  // Vinhetas, fotos, comerciais e avisos são isentos — cada um tem regra própria.
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
  const [completedFixedIds, setCompletedFixedIds] = useState<string[]>([])
  const [nextFixedId, setNextFixedId] = useState<string | null>(null)
  const [libraryVersion, setLibraryVersion] = useState<string | null>(null)
  // Contador para informativos determinísticos: a cada 7 acadêmicos, exibe 1 informativo
  const [academicSinceLastInformativo, setAcademicSinceLastInformativo] = useState(0)
  /** Rodada de informativos já exibidos, persistida para não repetir o mesmo aviso. */
  const [completedInformativoIds, setCompletedInformativoIds] = useState<string[]>([])
  /** IDs de mídia que falharam ao carregar — persistidos em `error_contents`. */
  const [failedIds, setFailedIds] = useState<string[]>([])
  /** Falha transitória de leitura da pasta: impede sobrescrever o estado salvo. */
  const [readError, setReadError] = useState<string | null>(null)

  const [fixedContent, setFixedContent] = useState<ProgrammingQueueItem[]>([])
  const [informativos, setInformativos] = useState<TvInformativo[]>([])
  const [galleries, setGalleries] = useState<TvGallery[]>([])
  const [photosMap, setPhotosMap] = useState<Record<string, TvGalleryPhoto[]>>({})

  const [ready, setReady] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)

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

  /** Escolhe o próximo fixo: aleatório entre os ainda não exibidos na rodada de fixos (sem repetição). */
  const pickNextFixedId = useCallback(function(
    fixed: ProgrammingQueueItem[],
    completedFixed: string[],
  ): string | null {
    if (fixed.length === 0) return null
    let available = fixed.filter(function(f) { return !completedFixed.includes(f.id) })
    // Se todos os fixos da rodada já foram exibidos, reinicia a rodada (Seção 6 do Plano)
    if (available.length === 0) {
      available = fixed
    }
    return available[Math.floor(Math.random() * available.length)].id
  }, [])

  /** Escolhe o próximo informativo (aleatório entre os ainda não exibidos na rodada). */
  const pickNextInformativo = useCallback(function(
    availableInformativos: TvInformativo[],
    completed: string[],
  ): TvInformativo | null {
    const available = availableInformativos.filter(function(i) { return !completed.includes(i.id) })
    if (available.length === 0) return null
    return available[Math.floor(Math.random() * available.length)]
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
            setNextFixedId(saved.next_fixed_id)
            setLibraryVersion(saved.library_version)
            setCompletedFixedIds(saved.completed_fixed_ids ?? [])
            setAcademicSinceLastInformativo(saved.academic_since_last_informativo ?? 0)
            setCompletedInformativoIds(saved.completed_informativo_ids ?? [])
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

        setFixedContent(discovery.fixed.map(function(f): ProgrammingQueueItem {
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
        }))
        setInformativos(discovery.informativos)
        setGalleries(discovery.galleries)
        setPhotosMap(discovery.photosMap)

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

        const restoredFailed = saved?.error_contents ?? []
        setFailedIds(restoredFailed)
        const informativoIds = new Set(discovery.informativos.map(i => i.id))
        const restoredInformativoIds = (saved?.completed_informativo_ids ?? [])
          .filter(id => informativoIds.has(id))

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
            setAcademicSinceLastFixed(saved.academic_since_last_fixed ?? 0)
            setCompletedIds(saved.completed_ids ?? [])
            setNextFixedId(saved.next_fixed_id)
            setLibraryVersion(saved.library_version)
            // Novos campos com fallback para estado vazio (compatibilidade retroativa)
            setCompletedFixedIds(saved.completed_fixed_ids ?? [])
            setAcademicSinceLastInformativo(saved.academic_since_last_informativo ?? 0)
            setCompletedInformativoIds(restoredInformativoIds)
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
        setCompletedInformativoIds([])
        const firstFixedId = pickNextFixedId(discovery.fixed.map(toFixedItem), [])
        setNextFixedId(firstFixedId)
        setLibraryVersion(version)
        persistState({
          ...emptyTauriState(),
          pending_queue: newQueue.map(function(i) { return i.id }),
          next_fixed_id: firstFixedId,
          library_version: version,
          error_contents: restoredFailed,
          last_video_played_at: historyRef.current,
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
  }, [loadPersistedState, persistState, pickNextFixedId, rebuildQueueFromIds, initialRetry])

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

  const advance = useCallback(function() {
    const pending = pendingFilesRef.current
    if (pending) {
      pendingFilesRef.current = null
      candidateFingerprintRef.current = null
      const previous = new Map(appliedFilesRef.current.map(f => [f.path, mediaFingerprint(f)]))
      const changed = new Set(pending.filter(f => previous.get(f.path) !== mediaFingerprint(f)).map(f => localId(f.path)))
      const survivingIds = new Set(pending.map(f => localId(f.path)))
      const failures = failedIds.filter(id => survivingIds.has(id) && !changed.has(id))
      const discovery = discoverLocalStructure(pending)
      discoveryRef.current = discovery
      appliedFilesRef.current = pending
      setFailedIds(failures)
      const nextFixed = discovery.fixed.map((f): ProgrammingQueueItem => ({
        id: f.id, type: 'fixed', file_path: f.file_path, file_name: f.file_name,
        file_type: f.file_type, duration_seconds: f.duration_seconds, is_trailer: false, is_fixed: true,
      }))
      setFixedContent(nextFixed)
      setCompletedFixedIds(ids => ids.filter(id => nextFixed.some(f => f.id === id) && !changed.has(id)))
      const informativoIds = new Set(discovery.informativos.map(i => i.id))
      setCompletedInformativoIds(ids => ids.filter(id => informativoIds.has(id) && !changed.has(id)))
      setInformativos(discovery.informativos)
      setGalleries(discovery.galleries)
      setPhotosMap(discovery.photosMap)
      setDiscoveryError(discovery.totalContents === 0 && discovery.totalFixed === 0 && discovery.informativos.length === 0 && discovery.galleries.length === 0
        ? 'Nenhum conteúdo encontrado na pasta sincronizada do Drive.' : null)
      setLibraryVersion(new Date().toISOString())
      const available = buildLocalQueue(discovery.courses, failures)
      const byId = new Map(available.map(item => [item.id, item]))
      const oldIds = new Set(queue.map(item => item.id))
      const before = queue.slice(0, position + 1).flatMap(item => byId.has(item.id) ? [byId.get(item.id)!] : [])
      const after = queue.slice(position + 1).flatMap(item => byId.has(item.id) ? [byId.get(item.id)!] : [])
      const additions = available.filter(item => !oldIds.has(item.id))
      const lastCourseId = before[before.length - 1]?.course_id
      if (after.length + additions.length > 0) {
        setQueue([...before, ...after, ...additions])
        const merged = [...before, ...after, ...additions]
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
        const last = queue[position]?.id
        if (available.length > 1 && available[0].id === last) {
          available.push(available.shift()!)
        }
        setQueue(available)
        setPosition(nextEligiblePosition(available, 0, historyRef.current, failures, Date.now(), lastCourseId))
        setCompletedIds([])
      }
      return
    }
    if (queue.length === 0) {
      setPosition(0)
      return
    }

    const next = nextEligiblePosition(
      queue, position + 1, historyRef.current, failedIds, Date.now(), queue[position]?.course_id,
    )
    if (next < queue.length) {
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
    const playable = queue.filter(function(i) { return !failedIds.includes(i.id) })
    // Remove definitivamente a mídia quebrada mesmo quando só um item resta.
    if (playable.length !== queue.length) {
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
      setPosition(nextEligiblePosition(newOrder, 0, historyRef.current, failedIds))
    } else {
      setPosition(nextEligiblePosition(playable, 0, historyRef.current, failedIds))
    }
  }, [queue, position, failedIds])

  // Repara a seleção de fixos se uma atualização remover o próximo comercial
  // ou se ele tiver falhado ao carregar (mídia inválida não entra na rodada).
  const playableFixed = useMemo(
    function() { return fixedContent.filter(function(f) { return !failedIds.includes(f.id) }) },
    [fixedContent, failedIds],
  )

  useEffect(function() {
    if (nextFixedId && playableFixed.some(f => f.id === nextFixedId)) return
    const next = pickNextFixedId(playableFixed, completedFixedIds)
    if (next !== nextFixedId) setNextFixedId(next)
  }, [playableFixed, nextFixedId, completedFixedIds, pickNextFixedId])

  const markCurrentCompleted = useCallback(function() {
    const current = queue[position]
    // Durante o fallback de cooldown não há conteúdo acadêmico em andamento:
    // relógio/clima não podem consumir contadores nem avançar a fila.
    if (!current) return
    // Falha de mídia não conta como conteúdo assistido nem entra em `completedIds`.
    if (failedIds.includes(current.id)) {
      advance()
      return
    }
    {
      if (!current.is_fixed) {
        if (current.file_type === 'video' && !current.is_trailer) {
          const now = Date.now()
          const recent = Object.fromEntries(Object.entries(historyRef.current).filter(([, time]) => now - time < VIDEO_COOLDOWN_MS))
          historyRef.current = { ...recent, [current.id]: now }
          setLastVideoPlayedAt(historyRef.current)
        }
        setCompletedIds(function(prev) { return [...prev, current.id] })
        setAcademicCompleted(function(prev) { return prev + 1 })
        // Incrementa contador de informativos a cada conteúdo acadêmico
        setAcademicSinceLastInformativo(function(prev) { return prev + 1 })

        // Regra 5:1 de Fixos (1 comercial/institucional a cada 5 conteúdos acadêmicos concluídos)
        if (academicSinceLastFixed >= 4 && playableFixed.length > 0) {
          // Completou o ciclo de 5 acadêmicos e o comercial foi exibido:
          setAcademicSinceLastFixed(0)

          if (nextFixedId) {
            setCompletedFixedIds(function(prev) {
              const next = prev.includes(nextFixedId) ? prev : [...prev, nextFixedId]
              if (next.length >= playableFixed.length) {
                // Rodada completa de todos os fixos da pasta: reinicia a rodada
                setNextFixedId(pickNextFixedId(playableFixed, []))
                return []
              }
              setNextFixedId(pickNextFixedId(playableFixed, next))
              return next
            })
          }
        } else {
          setAcademicSinceLastFixed(function(prev) { return prev + 1 })
        }
      }
    }
    advance()
  }, [queue, position, advance, failedIds, academicSinceLastFixed, playableFixed, nextFixedId, pickNextFixedId])

  // Chamado pelo TvDisplay ao concluir um informativo: zera o contador e
  // registra o ID na rodada, para não repetir o mesmo aviso.
  const resetInformativoCounter = useCallback(function(informativoId?: string) {
    setAcademicSinceLastInformativo(0)
    if (!informativoId) return
    setCompletedInformativoIds(function(prev) {
      const next = prev.includes(informativoId) ? prev : [...prev, informativoId]
      const available = informativos.filter(function(i) { return !failedIds.includes(i.id) })
      // Rodada completa: reinicia para que os avisos voltem a ser elegíveis.
      return available.every(function(i) { return next.includes(i.id) }) ? [] : next
    })
  }, [informativos, failedIds])

  const getQueueStats = useCallback(function() {
    return {
      total: queue.length,
      completed: completedIds.length,
      pending: queue.length - completedIds.length,
    }
  }, [queue.length, completedIds.length])

  /* ── Derivados ────────────────────────────────────────────────────────── */

  const currentItem = queue[position] ?? null
  const isFixedDue = academicSinceLastFixed >= 4 && playableFixed.length > 0
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
    function() { return pickNextInformativo(playableInformativos, completedInformativoIds) },
    [pickNextInformativo, playableInformativos, completedInformativoIds],
  )
  // Informativo determinístico: aparece a cada 7 conteúdos acadêmicos
  const INFORMATIVO_INTERVAL = 7
  const informativoDue = (
    playableInformativos.length > 0 &&
    queue.length > 0 &&
    academicSinceLastInformativo >= INFORMATIVO_INTERVAL
  )

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
    })
  }, [ready, readError, position, academicCompleted, academicSinceLastFixed, completedIds, queue, nextFixedId, libraryVersion, persistState, failedIds, completedFixedIds, academicSinceLastInformativo, completedInformativoIds, lastVideoPlayedAt])

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
  }

  return (
    <ProgrammingCtx.Provider value={value}>
      {children}
    </ProgrammingCtx.Provider>
  )
}

/** Reexporta o utilitário de ID local (consumidores de fixtures/testes). */
export { localId as localContentId }
