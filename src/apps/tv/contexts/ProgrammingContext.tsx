/**
 * Contexto de Programação Acadêmica para LabHub TV
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  fetchCourses,
  fetchAllAcademicContent,
  fetchFixedContent,
  fetchInformatives,
} from '../services/programmingService'
import type { TvCourse, TvAcademicContent, TvFixedContent, TvInformativo } from '../types'

// Tipo simples para itens da fila
interface QueueItem {
  id: string
  type: 'academic' | 'fixed'
  course_id?: string
  course_name?: string
  file_path: string
  file_name: string
  file_type: 'video' | 'image'
  duration_seconds: number
  is_trailer: boolean
  is_fixed: boolean
}

export type { QueueItem as ProgrammingQueueItem }

interface ProgrammingState {
  cycle: number
  position: number
  academicCompleted: number
  academicSinceLastFixed: number
  completedIds: string[]
  pendingQueue: string[]
  nextFixedId: string | null
  libraryVersion: string | null
  errorContents: string[]
}

interface ProgrammingContextValue {
  queue: QueueItem[]
  currentItem: QueueItem | null
  position: number
  academicCompleted: number
  academicSinceLastFixed: number
  advance: () => void
  markCurrentCompleted: () => Promise<void>
  getQueueStats: () => { total: number; completed: number; pending: number }
  courses: TvCourse[]
  academicContent: TvAcademicContent[]
  fixedContent: TvFixedContent[]
  informatives: TvInformativo[]
  isFixedDue: boolean
  nextFixedId: string | null
  loadState: () => Promise<void>
  saveState: (state: ProgrammingState) => Promise<void>
  checkpoint: () => Promise<ProgrammingState | null>
  restoreCheckpoint: (checkpoint: ProgrammingState) => Promise<void>
  nextInformativo: TvInformativo | null
  informativoDue: boolean
}

const ProgrammingCtx = createContext<ProgrammingContextValue | null>(null)

export function useProgramming() {
  const v = useContext(ProgrammingCtx)
  if (!v) throw new Error('useProgramming must be used within <ProgrammingProvider>')
  return v
}

export interface ProgrammingProviderProps {
  children: ReactNode
}

interface TauriProgrammingState {
  cycle: number
  position: number
  academicCompleted: number
  academicSinceLastFixed: number
  completedIds: string[]
  pendingQueue: string[]
  nextFixedId: string | null
  libraryVersion: string | null
  errorContents: string[]
}

function useTauriProgramming() {
  const invoke = function<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (typeof window !== 'undefined' && window.__TAURI__) {
      return window.__TAURI__.core.invoke(command, args)
    }
    throw new Error('Tauri não disponível')
  }

  return {
    getState: function() { return invoke<TauriProgrammingState>('programming_state_get') },
    setState: function(state: TauriProgrammingState) { return invoke<void>('programming_state_set', { state }) },
    resetState: function() { return invoke<void>('programming_state_reset') },
  }
}

function shuffleArray<T>(array: T[], random: () => number = Math.random): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function toQueueItem(content: TvAcademicContent, courseName: string): QueueItem {
  return {
    id: content.id,
    type: 'academic',
    course_id: content.course_id,
    course_name: courseName,
    file_path: content.file_path,
    file_name: content.file_name,
    file_type: content.file_type as 'video' | 'image',
    duration_seconds: content.duration_seconds,
    is_trailer: false,
    is_fixed: false,
  }
}

export function ProgrammingProvider({ children }: ProgrammingProviderProps) {
  // const driveDiscovery = useDriveDiscovery()  // Not used currently

  // Estado da programação
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [position, setPosition] = useState(0)
  const [academicCompleted, setAcademicCompleted] = useState(0)
  const [academicSinceLastFixed, setAcademicSinceLastFixed] = useState(0)
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [nextFixedId, setNextFixedId] = useState<string | null>(null)
  const [libraryVersion, setLibraryVersion] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  // Dados do servidor
  const [courses, setCourses] = useState<TvCourse[]>([])
  const [academicContent, setAcademicContent] = useState<TvAcademicContent[]>([])
  const [fixedContent, setFixedContent] = useState<TvFixedContent[]>([])
  const [informatives, setInformatives] = useState<TvInformativo[]>([])

  // Tauri programming commands
  const tauriProgramming = useTauriProgramming()

  // Persistência via Tauri
  const saveStateToTauri = useCallback(function(state: ProgrammingState): Promise<void> {
    try {
      const tauriState: TauriProgrammingState = {
        cycle: state.cycle,
        position: state.position,
        academicCompleted: state.academicCompleted,
        academicSinceLastFixed: state.academicSinceLastFixed,
        completedIds: state.completedIds,
        pendingQueue: state.pendingQueue,
        nextFixedId: state.nextFixedId,
        libraryVersion: state.libraryVersion,
        errorContents: state.errorContents,
      }
      return tauriProgramming.setState(tauriState)
    } catch (e) {
      console.error('[Programming] falha ao salvar via Tauri:', e)
      throw e
    }
  }, [tauriProgramming])

  const loadStateFromTauri = useCallback(function(): Promise<TauriProgrammingState | null> {
    try {
      return tauriProgramming.getState()
    } catch {
      return Promise.resolve(null)
    }
  }, [tauriProgramming])

  // Build queue from academic content
  const buildQueue = useCallback(async function(): Promise<QueueItem[]> {
    const allContent = await fetchAllAcademicContent()
    const allCourses = await fetchCourses()

    const courseMap = new Map<string, TvCourse>()
    for (const c of allCourses) {
      courseMap.set(c.id, c)
    }

    const pending = allContent.filter(function(c) { return !completedIds.includes(c.id) })
    const shuffled = shuffleArray([...pending])

    return shuffled.map(function(c) {
      const courseName = courseMap.get(c.course_id)
      return toQueueItem(c, courseName ? courseName.name : '')
    })
  }, [completedIds])

  // Controle de Fixos
  const getNextFixedId = useCallback(function() {
    const availableFixed = fixedContent.filter(function(f) { return f.is_available })
    if (availableFixed.length === 0) return null

    const excludedIds = new Set(completedIds.filter(function(id) { 
      return fixedContent.find(function(f) { return f.id === id })
    }))

    const available = availableFixed.filter(function(f) { return !excludedIds.has(f.id) })
    if (available.length === 0) return null

    const chosen = available[Math.floor(Math.random() * available.length)]
    return chosen.id
  }, [fixedContent, completedIds])

  // Controle de Informativos
  const getNextInformativo = useCallback(function(): TvInformativo | null {
    const available = informatives.filter(function(i) { return i.is_available })
    if (available.length === 0) return null

    const excludedIds = new Set(completedIds.filter(function(id) { 
      return informatives.find(function(i) { return i.id === id })
    }))

    const availableFiltered = available.filter(function(i) { return !excludedIds.has(i.id) })
    if (availableFiltered.length === 0) return null

    return availableFiltered[Math.floor(Math.random() * availableFiltered.length)]
  }, [informatives, completedIds])

  const isInformationDue = useCallback(function() {
    if (queue.length === 0) return false
    const randomCheck = Math.random() < 0.15
    return randomCheck && position < queue.length - 1
  }, [position, queue.length])

  const isFixedDue = academicSinceLastFixed % 5 === 4 && academicSinceLastFixed > 0

  // Ações
  const advance = useCallback(function() {
    setPosition(function(prev) {
      const newPos = prev + 1
      if (newPos >= queue.length) {
        setAcademicCompleted(0)
        setAcademicSinceLastFixed(0)
        setCompletedIds([])
        setPosition(0)
      }
      return newPos % queue.length
    })
  }, [queue.length])

  const markCurrentCompleted = useCallback(async function() {
    const current = queue[position]
    if (!current) return

    try {
      if (!current.is_fixed) {
        setCompletedIds(function(prev) { return [...prev, current.id] })
        setAcademicCompleted(function(prev) { return prev + 1 })
        setAcademicSinceLastFixed(function(prev) { return prev + 1 })
      }

      const nextFixed = getNextFixedId()
      setNextFixedId(nextFixed)

      advance()
    } catch (e) {
      console.error('[Programming] erro:', e)
      setLastError(e instanceof Error ? e.message : String(e))
    }
  }, [queue, position, advance, getNextFixedId])

  // Carregamento inicial
  useEffect(function() {
    const loadInitialData = async function() {
      try {
        const apiCourses = await fetchCourses()
        setCourses(apiCourses)

        const apiContent = await fetchAllAcademicContent()
        setAcademicContent(apiContent)

        const apiFixed = await fetchFixedContent()
        setFixedContent(apiFixed)

        const apiInformatives = await fetchInformatives()
        setInformatives(apiInformatives)

        const tauriState = await loadStateFromTauri()

        if (tauriState && tauriState.libraryVersion) {
          setPosition(tauriState.position)
          setAcademicCompleted(tauriState.academicCompleted)
          setAcademicSinceLastFixed(tauriState.academicSinceLastFixed)
          setCompletedIds(tauriState.completedIds)
          setNextFixedId(tauriState.nextFixedId)
          setLibraryVersion(tauriState.libraryVersion)

          // Reconstruir queue
          const courseMap = new Map<string, TvCourse>()
          for (const c of apiCourses) {
            courseMap.set(c.id, c)
          }

          const queueItems: QueueItem[] = []
          for (const id of tauriState.pendingQueue) {
            const content = apiContent.find(function(c) { return c.id === id })
            if (content) {
              const courseName = courseMap.get(content.course_id)
              queueItems.push(toQueueItem(content, courseName ? courseName.name : ''))
            }
          }

          setQueue(queueItems)
        } else {
          const newQueue = await buildQueue()
          setQueue(newQueue)
          const newVersion = new Date().toISOString()
          setLibraryVersion(newVersion)

          await saveStateToTauri({
            cycle: 1,
            position: 0,
            academicCompleted: 0,
            academicSinceLastFixed: 0,
            completedIds: [],
            pendingQueue: newQueue.map(function(i) { return i.id }),
            nextFixedId: null,
            libraryVersion: newVersion,
            errorContents: [],
          })
        }
      } catch (e) {
        console.error('[Programming] erro:', e)
        setLastError(e instanceof Error ? e.message : String(e))
      }
    }

    loadInitialData()
  }, [buildQueue, loadStateFromTauri, saveStateToTauri])

  const nextInformativo = getNextInformativo()
  const currentItem = queue[position] ?? null

  // Persistência funções
  const saveState = useCallback(async function(state: ProgrammingState) {
    await saveStateToTauri(state)
  }, [saveStateToTauri])

  const checkpoint = useCallback(async function(): Promise<ProgrammingState | null> {
    const state: ProgrammingState = {
      cycle: 1,
      position,
      academicCompleted,
      academicSinceLastFixed,
      completedIds,
      pendingQueue: queue.map(function(i) { return i.id }),
      nextFixedId: nextFixedId,
      libraryVersion: libraryVersion,
      errorContents: lastError ? [lastError] : [],
    }
    await saveStateToTauri(state)
    return state
  }, [position, academicCompleted, academicSinceLastFixed, completedIds, queue, nextFixedId, libraryVersion, lastError, saveStateToTauri])

  const restoreCheckpoint = useCallback(async function(state: ProgrammingState) {
    setPosition(state.position)
    setAcademicCompleted(state.academicCompleted)
    setAcademicSinceLastFixed(state.academicSinceLastFixed)
    setCompletedIds(state.completedIds)
    // A queue será reconstruída via loadState ou buildQueue
    setNextFixedId(state.nextFixedId)
    setLibraryVersion(state.libraryVersion)
    if (state.errorContents.length > 0) setLastError(state.errorContents.join(', '))
  }, [queue])

  const loadState = useCallback(async function(): Promise<void> {
    const state = await loadStateFromTauri()
    if (state) {
      setPosition(state.position)
      setAcademicCompleted(state.academicCompleted)
      setAcademicSinceLastFixed(state.academicSinceLastFixed)
      setCompletedIds(state.completedIds)
      if (state.pendingQueue) {
        const courseMap = new Map<string, TvCourse>()
        courses.forEach(function(c) { courseMap.set(c.id, c) })
        const queueItems: QueueItem[] = []
        for (const id of state.pendingQueue) {
          const content = academicContent.find(function(c) { return c.id === id })
          if (content) {
            const courseName = courseMap.get(content.course_id)
            queueItems.push(toQueueItem(content, courseName ? courseName.name : ''))
          }
        }
        setQueue(queueItems)
      }
      if (state.nextFixedId) setNextFixedId(state.nextFixedId)
      if (state.libraryVersion) setLibraryVersion(state.libraryVersion)
    }
  }, [loadStateFromTauri, courses, academicContent, queue])

  // Salvamento periódico
  useEffect(function() {
    const saveIfChanged = async function() {
      const state: ProgrammingState = {
        cycle: 1,
        position,
        academicCompleted,
        academicSinceLastFixed,
        completedIds,
        pendingQueue: queue.map(function(i) { return i.id }),
        nextFixedId,
        libraryVersion,
        errorContents: lastError ? [lastError] : [],
      }
      await saveStateToTauri(state)
    }

    saveIfChanged()
  }, [position, academicCompleted, academicSinceLastFixed, completedIds, queue, nextFixedId, libraryVersion, lastError, saveStateToTauri])

  const value: ProgrammingContextValue = {
    queue,
    currentItem,
    position,
    academicCompleted,
    academicSinceLastFixed,
    advance,
    markCurrentCompleted,
    getQueueStats: function() {
      return {
        total: queue.length,
        completed: completedIds.length,
        pending: queue.length - completedIds.length,
      }
    },
    courses,
    academicContent,
    fixedContent,
    informatives,
    isFixedDue,
    nextFixedId,
    loadState,
    saveState,
    checkpoint,
    restoreCheckpoint,
    nextInformativo,
    informativoDue: isInformationDue(),
  }

  return (
    <ProgrammingCtx.Provider value={value}>
      {children}
    </ProgrammingCtx.Provider>
  )
}