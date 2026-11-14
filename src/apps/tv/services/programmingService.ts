/**
 * Serviços de programação acadêmica para LabHub TV
 *
 * Fornece APIs para:
 * - Gerenciamento de cursos
 * - Gerenciamento de conteúdo acadêmico
 * - Gerenciamento de conteúdo fixo
 * - Estado da programação
 * - Histórico de reprodução
 */

import { defaultDb as supabase } from '../../../lib/supabase'
import { workspaceStore } from '../../../core/workspaces/store'
import type {
  TvCourse,
  TvAcademicContent,
  TvFixedContent,
  TvInformativo,
  TvProgrammingState,
  TvPlaybackHistory,
  ProgrammingQueueItem,
  ProgrammingMetrics,
  ProgrammingCheckpoint,
} from '../types'

/* ── Erros ── */

export class ProgrammingServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgrammingServiceError'
  }
}

function workspaceId(): string | null {
  return workspaceStore.activeWorkspaceId
}

function checkWorkspace(): string {
  const ws = workspaceId()
  if (!ws) throw new ProgrammingServiceError('Workspace não selecionado')
  return ws
}

/* ── CURSOS ── */

export async function fetchCourses(): Promise<TvCourse[]> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const { data, error } = await supabase
    .from('tv_courses')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data as TvCourse[]) || []
}

export async function fetchCourseById(id: string): Promise<TvCourse | null> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const { data, error } = await supabase
    .from('tv_courses')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return (data as TvCourse) || null
}

export async function createCourse(values: Omit<TvCourse, 'id' | 'created_at' | 'workspace_id'>): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase.from('tv_courses').insert({
    ...values,
    workspace_id: ws,
  })
  if (error) throw error
}

export async function updateCourse(id: string, values: Partial<TvCourse>): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_courses')
    .update(values)
    .eq('id', id)
    .eq('workspace_id', ws)

  if (error) throw error
}

export async function deleteCourse(id: string): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_courses')
    .delete()
    .eq('id', id)
    .eq('workspace_id', ws)

  if (error) throw error
}

/* ── CONTEÚDO ACADÊMICO ── */

export async function fetchAcademicContent(courseId?: string): Promise<TvAcademicContent[]> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  
  let query = supabase.from('tv_academic_content').select('*')
  if (courseId) {
    query = query.eq('course_id', courseId)
  }
  
  const { data, error } = await query.order('sort_order', { ascending: true })

  if (error) throw error
  return (data as TvAcademicContent[]) || []
}

export async function fetchAllAcademicContent(): Promise<TvAcademicContent[]> {
  return fetchAcademicContent()
}

export async function markContentCompleted(
  contentId: string,
  completedAt: string = new Date().toISOString()
): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_academic_content')
    .update({
      is_completed: true,
      completed_at: completedAt,
    })
    .eq('id', contentId)
    .eq('workspace_id', ws)

  if (error) throw error
}

export async function resetContentCompletion(): Promise<void> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_academic_content')
    .update({
      is_completed: false,
      completed_at: null,
    })

  if (error) throw error
}

/* ── CONTEÚDO FIXO ── */

export async function fetchFixedContent(): Promise<TvFixedContent[]> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const { data, error } = await supabase
    .from('tv_fixed_content')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data as TvFixedContent[]) || []
}

export async function incrementFixedDisplay(id: string): Promise<void> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_fixed_content')
    .update({
      display_count: supabase.rpc('increment', { table: 'tv_fixed_content', column: 'display_count', row_id: id }),
      last_displayed: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}

export async function setFixedUnavailable(id: string, unavailable: boolean = true): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_fixed_content')
    .update({ is_available: !unavailable })
    .eq('id', id)
    .eq('workspace_id', ws)

  if (error) throw error
}

/* ── CONTEÚDO INFORMATIVO ── */

export async function fetchInformatives(): Promise<TvInformativo[]> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const { data, error } = await supabase
    .from('tv_informatives')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data as TvInformativo[]) || []
}

export async function setInformativoUnavailable(id: string, unavailable: boolean = true): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_informatives')
    .update({ is_available: !unavailable })
    .eq('id', id)
    .eq('workspace_id', ws)

  if (error) throw error
}

export async function incrementInformativoDisplay(id: string): Promise<void> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_informatives')
    .update({
      display_count: supabase.rpc('increment', { table: 'tv_informatives', column: 'display_count', row_id: id }),
      last_displayed: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}

/* ── ESTADO DA PROGRAMAÇÃO ── */

export async function getProgrammingState(): Promise<TvProgrammingState | null> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const ws = workspaceId()
  if (!ws) return null

  const { data, error } = await supabase
    .from('tv_programming_state')
    .select('*')
    .eq('workspace_id', ws)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw error
  }
  return (data as TvProgrammingState) || null
}

export async function initializeProgrammingState(): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase.from('tv_programming_state').insert({
    workspace_id: ws,
    cycle_version: 1,
    current_position: 0,
    academic_completed: 0,
    academic_since_last_fixed: 0,
    current_cycle_completed_ids: [],
    pending_queue_ids: [],
    pending_order: [],
    last_updated: new Date().toISOString(),
  })

  if (error) {
    if (error.code !== '23505') throw error // ignore duplicate key error
  }
}

export async function updateProgrammingState(
  updates: Partial<TvProgrammingState>
): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_programming_state')
    .update({
      ...updates,
      last_updated: new Date().toISOString(),
    })
    .eq('workspace_id', ws)

  if (error) throw error
}

export async function resetProgrammingCycle(): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase
    .from('tv_programming_state')
    .update({
      cycle_version: 1,  // Reset to 1 for new cycle
      current_position: 0,
      academic_completed: 0,
      academic_since_last_fixed: 0,
      current_cycle_completed_ids: [],
      pending_queue_ids: [],
      pending_order: [],
      last_fixed_id: null,
      last_fixed_at: null,
      error_contents: '[]',
      library_version: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    })
    .eq('workspace_id', ws)

  if (error) throw error
}

/* ── HISTÓRICO ── */

export async function recordPlayback(
  entry: Omit<TvPlaybackHistory, 'id' | 'created_at' | 'playback_started'>
): Promise<void> {
  const ws = checkWorkspace()
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase.from('tv_playback_history').insert({
    ...entry,
    workspace_id: ws,
    playback_started: new Date().toISOString(),
  })

  if (error) throw error
}

export async function fetchRecentPlayback(limit: number = 50): Promise<TvPlaybackHistory[]> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const ws = workspaceId()
  if (!ws) return []

  const { data, error } = await supabase
    .from('tv_playback_history')
    .select('*')
    .eq('workspace_id', ws)
    .order('playback_started', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data as TvPlaybackHistory[]) || []
}

/* ── FILA DE PROGRAMAÇÃO ── */

/**
 * Constrói a fila de programação com:
 * 1. Todos os conteúdos acadêmicos não concluídos (embaralhados)
 * 2. Ajuste para evitar consecutivos do mesmo curso
 * 3. Marcação de próximo comercial a inserir
 */
export async function buildProgrammingQueue(
  options?: {
    forceNewOrder?: boolean
    libraryVersion?: string
  }
): Promise<ProgrammingQueueItem[]> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const ws = workspaceId()
  if (!ws) throw new ProgrammingServiceError('Workspace não selecionado')

  // Buscar cursos
  const { data: courses, error: coursesError } = await supabase
    .from('tv_courses')
    .select('*')
    .eq('workspace_id', ws)

  if (coursesError) throw coursesError
  const courseMap = new Map<string, TvCourse>()
  ;(courses as TvCourse[] || []).forEach(c => courseMap.set(c.id, c))

  // Buscar conteúdo acadêmico pendente
  const { data: academicContent, error: contentError } = await supabase
    .from('tv_academic_content')
    .select('*')
    .eq('workspace_id', ws)
    .eq('is_completed', false)

  if (contentError) throw contentError

  // Buscar conteúdo fixo disponível (usado para planejamento de comerciais)
  const { error: fixedError } = await supabase
    .from('tv_fixed_content')
    .select('*')
    .eq('workspace_id', ws)
    .eq('is_available', true)

  if (fixedError) throw fixedError

  // Construir lista de items acadêmicos com info de curso
  const academicItems: ProgrammingQueueItem[] = (academicContent as TvAcademicContent[] || [])
    .map(c => {
      const course = courseMap.get(c.course_id)
      const isTrailer = c.file_name.toUpperCase().startsWith('VINHETA_')
      return {
        id: c.id,
        type: 'academic' as const,
        course_id: c.course_id,
        course_name: course?.name,
        file_path: c.file_path,
        file_name: c.file_name,
        file_type: c.file_type as 'video' | 'image',
        duration_seconds: c.duration_seconds,
        is_trailer: isTrailer,
        is_fixed: false,
      }
    })
    // Filtrar vinhetas - elas serão inseridas automaticamente antes de cada conteúdo
    .filter(item => !item.is_trailer)

  // Embaralhar globalmente
  const shuffled = shuffleArray([...academicItems])

  // Ajustar para evitar consecutivos do mesmo curso
  const optimized = optimizeCourseDistribution(shuffled)

  // Calcular posições para comerciais (a cada 5 unidades)
  const queueWithPosition: ProgrammingQueueItem[] = []
  let academicCount = 0

  for (const item of optimized) {
    if (academicCount % 5 === 4) {
      // Próximo comercial será inserido
      // A posição será ajustada na hora da reprodução
    }
    queueWithPosition.push(item)
    academicCount++
  }

  // Atualizar estado da programação
  const libraryVersion = options?.libraryVersion || new Date().toISOString()
  await upsertProgrammingState({
    cycle_version: 1,
    current_position: 0,
    academic_completed: 0,
    academic_since_last_fixed: 0,
    current_cycle_completed_ids: [],
    pending_queue_ids: optimized.map(i => i.id),
    pending_order: optimized.map(i => i.id),
    last_fixed_id: null,
    library_version: libraryVersion,
    error_contents: '[]',
  } as unknown as TvProgrammingState)

  return queueWithPosition
}

/** Shuffle algoritmo Fisher-Yates */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Otimiza para evitar consecutivos do mesmo curso quando houver alternativas */
function optimizeCourseDistribution(items: ProgrammingQueueItem[]): ProgrammingQueueItem[] {
  if (items.length <= 3) return items

  const result: ProgrammingQueueItem[] = []
  const remaining = [...items]

  // Agrupar por curso
  const byCourse = new Map<string, ProgrammingQueueItem[]>()
  for (const item of remaining) {
    if (item.course_id) {
      const list = byCourse.get(item.course_id) || []
      list.push(item)
      byCourse.set(item.course_id, list)
    }
  }

  // Verificar se temos alternativas de cursos
  // const coursesWithMultiple = Array.from(byCourse.values()).filter(l => l.length > 1)

  while (remaining.length > 0) {
    // Encontrar item de outro curso (não consecutivo)
    const currentCourse = result.length > 0 ? result[result.length - 1].course_id : null

    let candidates = remaining
    if (currentCourse) {
      candidates = remaining.filter(
        i => !i.course_id || i.course_id !== currentCourse
      )
    }

    if (candidates.length === 0) {
      // Não há alternativa, usar qualquer um
      candidates = remaining
    }

    // Escolher aleatoriamente
    const idx = Math.floor(Math.random() * candidates.length)
    const chosen = candidates[idx]
    const chosenIndex = remaining.indexOf(chosen)

    if (chosenIndex !== -1) {
      remaining.splice(chosenIndex, 1)
    }

    // Remover do mapa de cursos
    if (chosen.course_id) {
      const list = byCourse.get(chosen.course_id)
      if (list) {
        const listIdx = list.indexOf(chosen)
        if (listIdx !== -1) list.splice(listIdx, 1)
      }
    }

    result.push(chosen)
  }

  return result
}

async function upsertProgrammingState(state: TvProgrammingState): Promise<void> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')

  const { error } = await supabase.from('tv_programming_state').upsert(state, {
    onConflict: 'workspace_id',
  })

  if (error) throw error
}

/* ── MÉTRICAS DE MONITORAMENTO ── */

export async function fetchProgrammingMetrics(): Promise<ProgrammingMetrics> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const ws = workspaceId()
  if (!ws) throw new ProgrammingServiceError('Workspace não selecionado')

  // Total de conteúdo acadêmico
  const { count: totalAcademic } = await supabase
    .from('tv_academic_content')
    .select('*', { count: 'exact' })
    .eq('workspace_id', ws)

  // Concluído no ciclo atual (via estado)
  const { data: state } = await supabase
    .from('tv_programming_state')
    .select('academic_completed, current_cycle_completed_ids, library_version, academic_since_last_fixed')
    .eq('workspace_id', ws)
    .single()

  const academicCompleted = state?.academic_completed || 0
  // const totalInCycle = (state?.current_cycle_completed_ids as string[])?.length || 0

  // Pendentes
  const { count: pending } = await supabase
    .from('tv_academic_content')
    .select('*', { count: 'exact' })
    .eq('workspace_id', ws)
    .eq('is_completed', false)

  // Com erros
  const { data: history } = await supabase
    .from('tv_playback_history')
    .select('content_id, status')
    .eq('workspace_id', ws)
    .eq('status', 'error')

  const errorIds = new Set((history as TvPlaybackHistory[] || []).map(h => h.content_id))

  // Conteúdo fixo
  const { count: totalFixed } = await supabase
    .from('tv_fixed_content')
    .select('*', { count: 'exact' })
    .eq('workspace_id', ws)

  const { count: fixedAvailable } = await supabase
    .from('tv_fixed_content')
    .select('*', { count: 'exact' })
    .eq('workspace_id', ws)
    .eq('is_available', true)

  // Última reprodução
  const { data: lastPlayback } = await supabase
    .from('tv_playback_history')
    .select('playback_started')
    .eq('workspace_id', ws)
    .order('playback_started', { ascending: false })
    .limit(1)
    .single()

  // Progresso do ciclo
  const totalAcademicCount = totalAcademic || 0
  const cycleProgress = totalAcademicCount > 0
    ? Math.round((academicCompleted / totalAcademicCount) * 100)
    : 0

  // Comerciais
  const { data: recentFixed } = await supabase
    .from('tv_playback_history')
    .select('content_id, playback_started')
    .eq('workspace_id', ws)
    .eq('content_type', 'fixed')
    .order('playback_started', { ascending: false })
    .limit(10)

  const commercialCount = (recentFixed as TvPlaybackHistory[] || []).length
  const lastCommercialId = (recentFixed as TvPlaybackHistory[] || [])[0]?.content_id
  // const lastCommercialAt = (recentFixed as TvPlaybackHistory[] || [])[0]?.playback_started

  return {
    total_academic_content: totalAcademic || 0,
    academic_completed_current_cycle: academicCompleted,
    academic_pending: pending || 0,
    academic_with_errors: errorIds.size,
    total_fixed_content: totalFixed || 0,
    fixed_available: fixedAvailable || 0,
    last_playback: lastPlayback?.playback_started || null,
    current_course: state ? '' : null, // será preenchido com base na posição atual
    cycle_progress_percent: cycleProgress,
    commercials_played: commercialCount,
    last_commercial: lastCommercialId || null,
    academic_since_last_commercial: state?.academic_since_last_fixed || 0,
    library_version: state ? state.library_version ?? null : null,
  }
}

/* ── CHECKPOINT DE RETOMADA ── */

export async function createCheckpoint(): Promise<ProgrammingCheckpoint> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const ws = workspaceId()
  if (!ws) throw new ProgrammingServiceError('Workspace não selecionado')

  const { data } = await supabase
    .from('tv_programming_state')
    .select('*')
    .eq('workspace_id', ws)
    .single()

  if (!data) {
    throw new ProgrammingServiceError('Estado da programação não encontrado')
  }

  const state = data as TvProgrammingState

  return {
    cycle_version: state.cycle_version,
    position: state.current_position,
    academic_completed: state.academic_completed,
    academic_since_last_fixed: state.academic_since_last_fixed,
    completed_ids: state.current_cycle_completed_ids || [],
    pending_order: state.pending_order || [],
    error_contents: (state.error_contents ? JSON.parse(state.error_contents) : []) as string[],
    last_fixed_at: state.last_fixed_at,
    library_version: state.library_version,
  }
}

export async function restoreFromCheckpoint(checkpoint: ProgrammingCheckpoint): Promise<void> {
  if (!supabase) throw new ProgrammingServiceError('Supabase não inicializado')
  const ws = checkWorkspace()

  const { error } = await supabase
    .from('tv_programming_state')
    .update({
      cycle_version: checkpoint.cycle_version,
      current_position: checkpoint.position,
      academic_completed: checkpoint.academic_completed,
      academic_since_last_fixed: checkpoint.academic_since_last_fixed,
      current_cycle_completed_ids: checkpoint.completed_ids,
      pending_order: checkpoint.pending_order,
      last_fixed_at: checkpoint.last_fixed_at,
      library_version: checkpoint.library_version,
      error_contents: JSON.stringify(checkpoint.error_contents),
      last_updated: new Date().toISOString(),
    })
    .eq('workspace_id', ws)

  if (error) throw error
}