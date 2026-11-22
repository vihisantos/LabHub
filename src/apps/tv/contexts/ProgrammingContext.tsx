/**
 * Contexto de Programação do LabHub TV — modo LOCAL (Tauri Desktop).
 *
 * Zero tráfego Supabase: a fila é construída a partir dos arquivos já
 * sincronizados do Google Drive (services/localProgramming) e o estado é
 * persistido localmente pelos comandos Tauri `programming_state_get/set/reset`
 * (JSON durável em %APPDATA%/LabHub TV/programming-state.json).
 *
 * Regras de programação preservadas do modelo original:
 *   - Conteúdo fixo toca a cada 5 itens acadêmicos (academicSinceLastFixed % 5 === 4).
 *   - Informativo tem 15% de chance por avanço (enquanto houver fila).
 *   - Fim do ciclo → itens voltam a ficar pendentes e a ordem é reembaralhada;
 *     os contadores acumulados são preservados para as cadências periódicas.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  listLocalMediaWithStatus,
  discoverLocalStructure,
  buildLocalQueue,
  shuffleArray,
  optimizeCourseDistribution,
  localId,
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
  /** Chame após exibir um informativo para zerar o contador e evitar repetição imediata. */
  resetInformativoCounter: () => void
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

  /** Escolhe o próximo informativo (aleatório entre disponíveis no ciclo). */
  const pickNextInformativo = useCallback(function(completed: string[]): TvInformativo | null {
    const available = informativos.filter(function(i) { return !completed.includes(i.id) })
    if (available.length === 0) return null
    return available[Math.floor(Math.random() * available.length)]
  }, [informativos])

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
          }
          // Sem descoberta não há itens para reconstruir, mas o player precisa
          // sair do "carregando": a tela de manutenção orienta o operador.
          setReady(true)
          return
        }

        setReadError(null)
        const discovery = discoverLocalStructure(files)
        discoveryRef.current = discovery

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

        if (discovery.totalContents === 0 && discovery.totalFixed === 0 && discovery.galleries.length === 0) {
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

        if (saved && queueValid && saved.library_version) {
          // Retomada: restaura contadores e reconstrói a fila pelos IDs.
          const restored = rebuildQueueFromIds(saved.pending_queue, restoredFailed)
          if (restored.length > 0) {
            setQueue(restored)
            setPosition(Math.min(saved.position, Math.max(restored.length - 1, 0)))
            setAcademicCompleted(saved.academic_completed ?? 0)
            setAcademicSinceLastFixed(saved.academic_since_last_fixed ?? 0)
            setCompletedIds(saved.completed_ids ?? [])
            setNextFixedId(saved.next_fixed_id)
            setLibraryVersion(saved.library_version)
            // Novos campos com fallback para estado vazio (compatibilidade retroativa)
            setCompletedFixedIds(saved.completed_fixed_ids ?? [])
            setAcademicSinceLastInformativo(saved.academic_since_last_informativo ?? 0)
            setReady(true)
            return
          }
        }

        // Primeira execução (ou biblioteca mudou): nova fila + novo ciclo.
        const newQueue = buildLocalQueue(discovery.courses, restoredFailed)
        const version = new Date().toISOString()
        setQueue(newQueue)
        setPosition(0)
        setAcademicCompleted(0)
        setAcademicSinceLastFixed(0)
        setCompletedIds([])
        setNextFixedId(pickNextFixedId(discovery.fixed.map(toFixedItem), []))
        setLibraryVersion(version)
        persistState({
          ...emptyTauriState(),
          pending_queue: newQueue.map(function(i) { return i.id }),
          next_fixed_id: null,
          library_version: version,
          error_contents: restoredFailed,
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
  }, [loadPersistedState, persistState, pickNextFixedId, rebuildQueueFromIds])

  /* ── Ações ────────────────────────────────────────────────────────────── */

  const markContentShown = useCallback(function() {
    setContentShown(function(prev) { return prev + 1 })
  }, [])

  /** Mídia quebrada é excluída da próxima rodada, sem alterar a contagem atual. */
  const reportMediaFailure = useCallback(function(id: string) {
    setFailedIds(function(prev) { return prev.includes(id) ? prev : [...prev, id] })
  }, [])

  const advance = useCallback(function() {
    if (queue.length === 0) {
      setPosition(0)
      return
    }

    const next = position + 1
    if (next < queue.length) {
      setPosition(next)
      return
    }

    // Fim do ciclo: reinicia a repetição dos itens (completedIds), mas preserva
    // os contadores acumulados. Zerá-los aqui fazia as cadências periódicas
    // nunca dispararem em bibliotecas menores que o intervalo (ex.: 1 vídeo →
    // comercial 5:1, informativo 7:1, relógio 4 e clima 8 jamais apareciam).
    setCompletedIds([])
    setPosition(0)

    // Nova rodada com ordem diferente: sem isso a TV repetiria exatamente a
    // mesma sequência em todos os ciclos.
    const playable = queue.filter(function(i) { return !failedIds.includes(i.id) })
    // Remove definitivamente a mídia quebrada mesmo quando só um item resta.
    if (playable.length !== queue.length) {
      setQueue(playable)
      if (position >= playable.length) setPosition(0)
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
    }
  }, [queue, position, failedIds])

  const markCurrentCompleted = useCallback(function() {
    const current = queue[position]
    // Falha de mídia não conta como conteúdo assistido nem entra em `completedIds`.
    if (current && failedIds.includes(current.id)) {
      advance()
      return
    }
    if (current) {
      if (!current.is_fixed) {
        setCompletedIds(function(prev) { return [...prev, current.id] })
        setAcademicCompleted(function(prev) { return prev + 1 })
        // Incrementa contador de informativos a cada conteúdo acadêmico
        setAcademicSinceLastInformativo(function(prev) { return prev + 1 })

        // Regra 5:1 de Fixos (1 comercial/institucional a cada 5 conteúdos acadêmicos concluídos)
        if (academicSinceLastFixed >= 4 && fixedContent.length > 0) {
          // Completou o ciclo de 5 acadêmicos e o comercial foi exibido:
          setAcademicSinceLastFixed(0)

          if (nextFixedId) {
            setCompletedFixedIds(function(prev) {
              const next = prev.includes(nextFixedId) ? prev : [...prev, nextFixedId]
              if (next.length >= fixedContent.length) {
                // Rodada completa de todos os fixos da pasta: reinicia a rodada
                setNextFixedId(pickNextFixedId(fixedContent, []))
                return []
              }
              setNextFixedId(pickNextFixedId(fixedContent, next))
              return next
            })
          }
        } else {
          setAcademicSinceLastFixed(function(prev) { return prev + 1 })
        }
      }
    }
    advance()
  }, [queue, position, advance, failedIds, academicSinceLastFixed, fixedContent, nextFixedId, pickNextFixedId])

  // Chamado pelo TvDisplay ao exibir um informativo para zerar o contador
  const resetInformativoCounter = useCallback(function() {
    setAcademicSinceLastInformativo(0)
  }, [])

  const getQueueStats = useCallback(function() {
    return {
      total: queue.length,
      completed: completedIds.length,
      pending: queue.length - completedIds.length,
    }
  }, [queue.length, completedIds.length])

  /* ── Derivados ────────────────────────────────────────────────────────── */

  const currentItem = queue[position] ?? null
  const isFixedDue = academicSinceLastFixed >= 4 && fixedContent.length > 0
  const nextInformativo = pickNextInformativo(completedIds)
  // Informativo determinístico: aparece a cada 7 conteúdos acadêmicos
  const INFORMATIVO_INTERVAL = 7
  const informativoDue = (
    informativos.length > 0 &&
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
    })
  }, [ready, readError, position, academicCompleted, academicSinceLastFixed, completedIds, queue, nextFixedId, libraryVersion, persistState, failedIds, completedFixedIds, academicSinceLastInformativo])

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
