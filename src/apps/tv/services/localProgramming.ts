/**
 * Programação LOCAL para o TV Desktop (Tauri) — zero tráfego Supabase.
 *
 * Fonte de verdade: os arquivos já sincronizados do Google Drive no disco,
 * listados pelo comando Tauri `list_synced_files` (src-tauri/src/main.rs).
 * Nenhuma chamada PostgREST/RPC/Realtime/Storage é feita aqui.
 *
 * Estrutura de pastas esperada na biblioteca sincronizada:
 *   <pasta do Drive>/
 *   ├── Fixos/              → conteúdo fixo/comercial (tv_fixed_content)
 *   ├── Informativos/       → slides informativos (tv_informatives)
 *   ├── Galerias/<Nome>/    → fotos da galeria (tv_galleries + fotos)
 *   └── Cursos/<Curso>/     → conteúdo acadêmico (tv_courses + tv_academic_content)
 *       ├── VINHETA.mp4     → vinheta do curso (nome exato, case-insensitive)
 *       └── CONTEUDO_*.mp4  → itens da fila acadêmica
 *
 * As pastas `Informativos/` e `Galerias/` são a contraparte local das tabelas
 * administrativas `tv_informatives` e `tv_galleries` (dados que não existiam
 * no Drive). Se ausentes, as fases correspondentes simplesmente não entram na
 * sequência de exibição — o player nunca quebra por falta delas.
 */

import type { ProgrammingQueueItem, TvFixedContent, TvGallery, TvGalleryPhoto, TvInformativo } from '../types'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'

/* ── Contratos ──────────────────────────────────────────────────────────── */

/** Arquivo retornado pelo comando Tauri `list_synced_files` (RichDriveFile). */
export interface LocalMediaFile {
  name: string
  path: string
  relativePath: string | null
  fileType: 'video' | 'image'
  size: number
  modifiedAt?: number | null
}

export interface LocalCourse {
  id: string
  name: string
  slug: string
  /** Caminho da vinheta (VINHETA.*), se existir. */
  trailer: string | null
  contents: LocalMediaFile[]
}

export interface LocalDiscovery {
  courses: LocalCourse[]
  fixed: TvFixedContent[]
  informativos: TvInformativo[]
  galleries: TvGallery[]
  photosMap: Record<string, TvGalleryPhoto[]>
  totalContents: number
  totalFixed: number
}

/* ── Descoberta via Tauri ───────────────────────────────────────────────── */

export interface LocalMediaResult {
  files: LocalMediaFile[]
  /** Erro de leitura da pasta; `null` quando a descoberta terminou normalmente. */
  error: string | null
}

/** Nomes de arquivos ainda em sincronização pelo Drive para computador. */
const PARTIAL_FILE = /(?:\.crdownload|\.tmp|\.part|~)$/i

/** Lista os arquivos e sinaliza falha de leitura sem transformá-la em biblioteca vazia. */
export async function listLocalMediaWithStatus(): Promise<LocalMediaResult> {
  try {
    // Caminho oficial do Tauri 2: @tauri-apps/api/core (sem global __TAURI__).
    const raw = await invoke<Array<{
      name: string
      size: number
      path: string
      relativePath: string | null
      parentFolder: string | null
      file_type: string
      isAvailable: boolean
      modifiedAt?: number | null
    }>>('list_synced_files')

    if (!Array.isArray(raw)) {
      return { files: [], error: 'Resposta invalida ao listar a pasta sincronizada' }
    }

    const files = raw
      .filter((f) => f && f.isAvailable
        && (f.file_type === 'video' || f.file_type === 'image')
        && typeof f.size === 'number' && f.size > 0
        && !PARTIAL_FILE.test(f.name ?? ''))
      .map((f) => ({
        name: f.name,
        path: f.path,
        relativePath: f.relativePath,
        fileType: f.file_type as 'video' | 'image',
        size: f.size,
        modifiedAt: f.modifiedAt ?? null,
      }))
    return { files, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn('[localProgramming] list_synced_files falhou:', message)
    return { files: [], error: message || 'Falha ao ler a pasta sincronizada' }
  }
}

/** Assinatura determinística; a ordem do WalkDir não representa uma alteração. */
export function mediaFingerprint(file: LocalMediaFile): string {
  return JSON.stringify([file.path, file.relativePath, file.fileType, file.size, file.modifiedAt ?? null])
}

/** A pasta Clima/ pertence só ao slide meteorológico: não muda a fila acadêmica. */
export function isAcademicLibraryFile(file: LocalMediaFile): boolean {
  const location = (file.relativePath || file.path).replace(/\\/g, '/').toLowerCase()
  return !location.split('/').some((part) => part === 'clima')
}

export function libraryFingerprint(files: LocalMediaFile[]): string {
  return JSON.stringify(files.filter(isAcademicLibraryFile).map(mediaFingerprint).sort())
}

/** Compatibilidade com consumidores que só precisam dos arquivos. */
export async function listLocalMedia(): Promise<LocalMediaFile[]> {
  return (await listLocalMediaWithStatus()).files
}

/* ── Helpers (mesmas convenções de useDriveDiscovery) ───────────────────── */

/** @deprecated - kept for reference, not used in current implementation */
export const VIDEO_BASENAMES = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv'])
/** @deprecated - kept for reference, not used in current implementation */
export const IMAGE_BASENAMES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

/** ID estável derivado do caminho (mesmo algoritmo de useDriveDiscovery). */
export function localId(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return 'drive_' + Math.abs(hash).toString(36)
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Convenção oficial de vinheta: nome exatamente "VINHETA.<ext>" (case-insensitive). */
export function isTrailerName(filename: string): boolean {
  const base = filename.toUpperCase().split('.')[0]
  return base === 'VINHETA'
}

/** Duração de exibição efetiva (s): imagens 15s; vídeos dirigidos por onEnd. */
function displaySeconds(fileType: 'video' | 'image'): number {
  return fileType === 'image' ? 15 : 0
}

/**
 * Converte caminho de disco em URL carregável (asset protocol no Tauri).
 *
 * Usa o convertFileSrc do @tauri-apps/api/core (Tauri v2). O global
 * window.__TAURI__ não existe por padrão no v2, e o formato antigo
 * 'asset://localhost/...' não é servido pelo v2 — nos dois casos o vídeo
 * simplesmente não carregava no desktop.
 */
export function toLocalUrl(filePath: string): string {
  if (!filePath) return filePath
  if (/^(https?:|blob:|data:|asset:|tauri:)/i.test(filePath)) return filePath
  try {
    return convertFileSrc(filePath)
  } catch {
    /* fora do Tauri (ex.: preview no navegador) */
  }
  return filePath
}

/* ── Descoberta estrutural ──────────────────────────────────────────────── */

const FIXED_ROOT = 'fixos'
const INFORMATIVOS_ROOT = 'informativos'
const GALLERIES_ROOT = 'galerias'
const CLIMATE_ROOT = 'clima'

/** Primeiro segmento do caminho relativo (nome da pasta raiz). */
/** @deprecated - kept for reference, not used in current implementation */
export function rootSegment(relativePath: string | null): string | null {
  if (!relativePath) return null
  const normalized = relativePath.replace(/\\/g, '/')
  const first = normalized.split('/')[0]
  return first ? first.toLowerCase() : null
}

/** Segmentos do caminho, já normalizados.
 *
 * Quando o caminho é absoluto (ex: G:\Meu Drive\LabHub -TV\Cursos\...),
 * o primeiro segmento é a unidade (G:), seguido por 'Meu Drive', etc.
 * Para a descoberta, precisamos identificar 'Cursos', 'Fixos', 'Informativos'
 * independentemente de estar em caminho relativo ou absoluto.
 *
 * Exemplo: G:\Meu Drive\LabHub -TV\Cursos\Direito\VINHETA.mp4
 * Retorna: ['LabHub-TV', 'Cursos', 'Direito', 'VINHETA.mp4']
 */
function segments(path: string | null): string[] {
  if (!path) return []

  // Normalizar barras invertidas e dividir
  const parts = path.replace(/\\/g, '/').split('/')
  // Remover segments vazios e segmentos de unidade (ex: 'G:')
  let result = parts.filter(Boolean).filter(p => !/^[A-Za-z]:$/.test(p))

  // Normalizar: remover 'Meu Drive' se seguido de 'LabHub-TV' ou variantes
  // O objetivo é ter apenas o nome da pasta raiz (ex: 'LabHub-TV')
  const normalized: string[] = []
  let skipUntilNext = false

  for (let i = 0; i < result.length; i++) {
    const curr = result[i]

    if (skipUntilNext) {
      // Se próximo for LabHub-TV ou similar, pular até lá
      if (curr.toLowerCase().includes('labhub')) {
        normalized.push('LabHub-TV')
        skipUntilNext = false
      }
      continue
    }

    // Detectar 'Meu Drive' seguido de LabHub-TV
    if (curr.toLowerCase() === 'meu' && i < result.length - 2 && result[i + 1]?.toLowerCase() === 'drive') {
      // Pular 'Meu', 'Drive' e processar 'LabHub-TV' depois
      skipUntilNext = true
      continue
    }

    // Normalizar 'LabHub -TV' ou 'LabHub-TV' como um único segmento
    if (curr.toLowerCase().includes('labhub')) {
      normalized.push('LabHub-TV')
      continue
    }

    normalized.push(curr)
  }
  return normalized
}

/**
 * Encontrar o índice de uma categoria específica no array de segmentos.
 * Útil para caminhos absolutos onde 'Cursos', 'Fixos' etc. podem estar em qualquer posição.
 */
function findCategoryIndex(segs: string[], category: string): number {
  return segs.findIndex(s => normalizeRoot(s) === category)
}

/** Normaliza o nome da pasta raiz (case-insensitive para driver de Google Drive) */
function normalizeRoot(root: string): string {
  return root.toLowerCase()
}

/**
 * Mapeia os arquivos do Drive para a estrutura de programação local.
 * Função pura — testável sem Tauri.
 *
 * Lógica de classificação:
 * 1. Procura por 'Cursos', 'Fixos', 'Informativos', 'Galerias' em qualquer posição do caminho
 * 2. Para Fixos/Informativos/Galerias: arquivo pertence à categoria se estiver na subpasta
 * 3. Para Cursos: arquivo pertence se estiver em Cursos/<NomeCurso>/<arquivo>
 */
export function discoverLocalStructure(files: LocalMediaFile[]): LocalDiscovery {
  const courseMap = new Map<string, LocalCourse>()
  const fixedFiles: LocalMediaFile[] = []
  const informativoFiles: LocalMediaFile[] = []
  const galleryMap = new Map<string, { gallery: TvGallery; photos: TvGalleryPhoto[] }>()

  // Verificar se existem arquivos em Cursos/<curso>/ (estrutura de curso dedicada)
  const hasDedicatedCoursesFolder = files.some((f) => {
    const pathForSegment = f.relativePath || f.path
    const segs = segments(pathForSegment)
    // Encontrar 'cursos' e verificar se tem nome de curso depois
    const cursosIdx = findCategoryIndex(segs, 'cursos')
    return cursosIdx !== -1 && cursosIdx < segs.length - 2
  })

  for (const file of files) {
    // Usar relPath como primeiro, ou path como fallback quando relPath está ausente
    const pathForSegment = file.relativePath || file.path

    // Aviso controlado quando fallback é usado
    const usingFallback = !file.relativePath
    if (usingFallback) {
      console.warn('[discoverLocalStructure] relativePath ausente para o arquivo:', file.name)
    }

    const allSegments = segments(pathForSegment)
    const rootIdx = !file.relativePath ? allSegments.lastIndexOf('LabHub-TV') : -1
    const segs = rootIdx >= 0 ? allSegments.slice(rootIdx + 1) : allSegments

    if (segs.length < 2) {
      continue // arquivo solto na raiz: sem categoria
    }

    // Clima/ é exclusivo do slide meteorológico; nunca vira curso nem entra
    // na fila acadêmica (mesmo em instalações sem a pasta Cursos/).
    if (segs.some((seg) => normalizeRoot(seg) === CLIMATE_ROOT)) continue

    // Encontrar índice de cada categoria no caminho
    const cursosIdx = findCategoryIndex(segs, 'cursos')
    const fixosIdx = findCategoryIndex(segs, 'fixos')
    const informativosIdx = findCategoryIndex(segs, 'informativos')
    const galeriasIdx = findCategoryIndex(segs, 'galerias')

    // Verificar se é conteúdo fixo (em Fixos/)
    if (fixosIdx !== -1 && fixosIdx < segs.length - 1) {
      fixedFiles.push(file)
      continue
    }

    // Verificar se é conteúdo informativo (em Informativos/)
    if (informativosIdx !== -1 && informativosIdx < segs.length - 1) {
      informativoFiles.push(file)
      continue
    }

    // Verificar se é galeria (em Galerias/<nome>/...)
    if (galeriasIdx !== -1 && galeriasIdx < segs.length - 2) {
      if (file.fileType !== 'image') continue
      const galleryName = segs[galeriasIdx + 1]
      const key = slugify(galleryName)
      let entry = galleryMap.get(key)
      if (!entry) {
        entry = {
          gallery: {
            id: 'gallery_' + key,
            title: galleryName,
            is_active: true,
            sort_order: galleryMap.size,
            workspace_id: null,
            created_at: new Date(0).toISOString(),
          },
          photos: [],
        }
        galleryMap.set(key, entry)
      }
      entry.photos.push({
        id: localId(file.path),
        gallery_id: entry.gallery.id,
        image_url: toLocalUrl(file.path),
        sort_order: entry.photos.length,
        created_at: new Date(0).toISOString(),
      })
      continue
    }

    // Descoberta de cursos com prioridade
    let courseName: string | null = null
    if (hasDedicatedCoursesFolder) {
      // Estrutura dedicada: Cursos/<NomeCurso>/<arquivo>
      if (cursosIdx !== -1 && cursosIdx < segs.length - 2) {
        courseName = segs[cursosIdx + 1]
      }
    } else {
      // Sem estrutura dedicada: qualquer outro nome é curso
      // (desde que não seja Fixos, Informativos ou Galerias)
      const firstSegment = segs[0]
      const firstSegmentNorm = normalizeRoot(firstSegment)
      if (firstSegmentNorm !== FIXED_ROOT && firstSegmentNorm !== INFORMATIVOS_ROOT && firstSegmentNorm !== GALLERIES_ROOT && segs.length >= 2) {
        courseName = firstSegment
      }
    }

    if (courseName) {
      const key = slugify(courseName)
      let course = courseMap.get(key)
      if (!course) {
        course = { id: 'course_' + key, name: courseName, slug: key, trailer: null, contents: [] }
        courseMap.set(key, course)
      }
      if (file.fileType === 'video' && isTrailerName(file.name)) {
        course.trailer = file.path
      } else {
        course.contents.push(file)
      }
      continue
    }
  }

  const galleries: TvGallery[] = []
  const photosMap: Record<string, TvGalleryPhoto[]> = {}
  for (const entry of galleryMap.values()) {
    galleries.push(entry.gallery)
    photosMap[entry.gallery.id] = entry.photos
  }

  const fixed: TvFixedContent[] = fixedFiles.map((file, idx) => ({
    id: localId(file.path),
    workspace_id: null,
    file_name: file.name,
    file_path: file.path,
    file_type: file.fileType,
    duration_seconds: displaySeconds(file.fileType),
    display_count: 0,
    last_displayed: null,
    thumbnail_url: null,
    sort_order: idx,
    is_available: true,
    created_at: new Date(0).toISOString(),
  }))

  const informativos: TvInformativo[] = informativoFiles.map((file, idx) => ({
    id: localId(file.path),
    workspace_id: null,
    file_name: file.name,
    file_path: file.path,
    file_type: file.fileType,
    duration_seconds: displaySeconds(file.fileType),
    display_count: 0,
    last_displayed: null,
    thumbnail_url: null,
    sort_order: idx,
    is_available: true,
    created_at: new Date(0).toISOString(),
  }))

  const courses = [...courseMap.values()]
  const totalContents = courses.reduce((sum, c) => sum + c.contents.length, 0)

  return {
    courses,
    fixed,
    informativos,
    galleries,
    photosMap,
    totalContents,
    totalFixed: fixed.length,
  }
}

/* ── Fila acadêmica local ───────────────────────────────────────────────── */

/** Fisher–Yates (mesmo algoritmo usado pelo ProgrammingContext original). */
export function shuffleArray<T>(array: T[], random: () => number = Math.random): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Evita consecutivos do mesmo curso quando há alternativas. */
export function optimizeCourseDistribution(items: ProgrammingQueueItem[]): ProgrammingQueueItem[] {
  if (items.length <= 2) return items
  const result: ProgrammingQueueItem[] = []
  const pool = [...items]
  while (pool.length > 0) {
    const last = result[result.length - 1]
    let pickIdx = pool.findIndex((i) => !last || i.course_id !== last.course_id)
    if (pickIdx === -1) pickIdx = 0 // só restou o mesmo curso
    result.push(pool.splice(pickIdx, 1)[0])
  }
  return result
}

function toQueueItem(file: LocalMediaFile, course: LocalCourse): ProgrammingQueueItem {
  return {
    id: localId(file.path),
    type: 'academic',
    course_id: course.id,
    course_name: course.name,
    course_trailer: course.trailer,
    file_path: file.path,
    file_name: file.name,
    file_type: file.fileType,
    duration_seconds: displaySeconds(file.fileType),
    is_trailer: false,
    is_fixed: false,
  }
}

/**
 * Constrói a fila acadêmica a partir dos cursos descobertos no Drive:
 * filtra concluídos do ciclo, embaralha e distribui para evitar
 * consecutivos do mesmo curso.
 *
 * REGRAS CONSOLIDADAS:
 * 1. Apenas conteúdos acadêmicos entram na fila (vídeos e fotos).
 * 2. Cursos sem conteúdo acadêmico NÃO entram na fila e NÃO tocam vinheta avulsa.
 * 3. A vinheta não entra como item avulso na fila; é reproduzida pelo player
 *    obrigatoriamente antes de cada vídeo ou foto acadêmica do curso.
 */
export function buildLocalQueue(
  courses: LocalCourse[],
  completedIds: string[],
  random: () => number = Math.random,
): ProgrammingQueueItem[] {
  const done = new Set(completedIds)
  const items: ProgrammingQueueItem[] = []

  for (const course of courses) {
    // Cursos sem conteúdo acadêmico não entram na fila
    if (!course.contents || course.contents.length === 0) continue

    for (const file of course.contents) {
      if (done.has(localId(file.path))) continue
      items.push(toQueueItem(file, course))
    }
  }

  return optimizeCourseDistribution(shuffleArray(items, random))
}
