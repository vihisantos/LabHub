/**
 * Descoberta automática de conteúdo acadêmico do Google Drive
 *
 * Este hook descobre cursos e arquivos de conteúdo a partir da estrutura
 * de pastas do Google Drive sincronizado localmente.
 *
 * Estrutura esperada:
 * LABHUB-TV/
 * ├── Fixos/           → Conteúdo fixo/comercial
 * └── Cursos/
 *     ├── Direito/
 *     │   ├── VINHETA.mp4   ← vinheta do curso (EXATAMENTE este nome)
 *     │   ├── CONTEUDO_001.mp4
 *     │   └── CONTEUDO_002.jpg
 *     └── ...
 */

import { useState, useEffect, useCallback } from 'react'
import type { DriveFile, DriveSyncStatus } from './useDriveSync'
import type { TvFixedContent } from '../types'

export interface DiscoveredCourse {
  id: string
  name: string
  slug: string
  trailer: string | null     // caminho da vinheta
  contents: DiscoveredContent[]
}

export interface DiscoveredContent {
  id: string
  name: string
  path: string
  type: 'video' | 'image'
  duration: number
  isTrailer: boolean
}

export interface DiscoveryResult {
  courses: DiscoveredCourse[]
  fixed: TvFixedContent[]
  totalContents: number
  totalFixed: number
  error: string | null
}

// Extensões de arquivo suportadas
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

/**
 * Determina o tipo de arquivo baseado na extensão
 */
function getFileType(filename: string): 'video' | 'image' | null {
  const ext = filename.toLowerCase().split('.').pop() || ''
  if (VIDEO_EXTENSIONS.includes('.' + ext)) return 'video'
  if (IMAGE_EXTENSIONS.includes('.' + ext)) return 'image'
  return null
}

/**
 * Gera um ID único baseado no caminho do arquivo
 */
function generateId(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return 'drive_' + Math.abs(hash).toString(36)
}

/**
 * Detecta se o arquivo é uma vinheta baseado no nome.
 * Convenção oficial: VINHETA.mp4 (case-insensitive, sem sufixo)
 * Apenas arquivos com nome exatamente "VINHETA" são vinhetas.
 */
function isTrailer(filename: string): boolean {
  const upper = filename.toUpperCase()
  const baseName = upper.split('.')[0]
  return baseName === 'VINHETA'
}

/**
 * Descobre cursos a partir da estrutura de pastas
 */
export function useDriveDiscovery() {
  const [courses, setCourses] = useState<DiscoveredCourse[]>([])
  const [fixed, setFixed] = useState<TvFixedContent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discoveredAt, setDiscoveredAt] = useState<string | null>(null)

  /**
   * Descobre cursos a partir da estrutura de pastas
   */
  const discover = useCallback(async (
    files: DriveFile[],
    
  ): Promise<DiscoveryResult> => {
    setLoading(true)
    setError(null)

    try {
      // Agrupar arquivos por pasta
      const fileMap = new Map<string, DriveFile[]>()
      
      for (const file of files) {
        const parentFolder = file.path.substring(0, file.path.lastIndexOf('\\'))
        const exists = fileMap.get(parentFolder)
        if (exists) {
          exists.push(file)
        } else {
          fileMap.set(parentFolder, [file])
        }
      }

      // Descobrir cursos (pastas dentro de Cursos/)
      const discoveredCourses: DiscoveredCourse[] = []
      const courseFolders = new Map<string, DiscoveredCourse>()

      for (const [folderPath, folderFiles] of fileMap.entries()) {
        // Verificar se é uma pasta de curso (ex: Cursos\Direito)
        const pathParts = folderPath.split('\\')
        const lastPart = pathParts[pathParts.length - 1]
        
        // Verificar se está em Cursos/ ou diretamente na raiz do LabHub-TV
        const isCourseFolder = lastPart.toUpperCase() === 'CURSOS' || 
          (pathParts.length >= 2 && pathParts[pathParts.length - 2].toUpperCase() === 'LABHUB-TV' && lastPart !== 'LabHub -TV')

        if (isCourseFolder && lastPart !== 'Fixos') {
          const courseName = lastPart
          const courseSlug = courseName.toLowerCase().replace(/\s+/g, '-')
          
          if (!courseFolders.has(courseSlug)) {
            courseFolders.set(courseSlug, {
              id: 'course_' + generateId(folderPath),
              name: courseName,
              slug: courseSlug,
              trailer: null,
              contents: [],
            })
          }

          // Filtrar arquivos de vídeo/imagem (não pastas)
          for (const file of folderFiles) {
            const type = getFileType(file.name)
            if (!type) continue // Pular pastas

            const content: DiscoveredContent = {
              id: generateId(file.path),
              name: file.name,
              path: file.path,
              type,
              duration: file.size > 0 ? estimateDuration(file.name, type) : 0,
              isTrailer: isTrailer(file.name),
            }

            const course = courseFolders.get(courseSlug)!
            course.contents.push(content)
          }
        }

        // Verificar se é a pasta Fixos
        if (lastPart.toUpperCase() === 'FIXOS') {
          const fixedItems: TvFixedContent[] = []
          
          for (const file of folderFiles) {
            const type = getFileType(file.name)
            if (!type) continue

            fixedItems.push({
              id: generateId(file.path),
              workspace_id: null, // será preenchido pelo backend
              file_name: file.name,
              file_path: file.path,
              file_type: type,
              duration_seconds: estimateDuration(file.name, type),
              display_count: 0,
              last_displayed: null,
              thumbnail_url: null,
              sort_order: 0,
              is_available: true,
              created_at: new Date().toISOString(),
            })
          }

          setFixed(fixedItems)
        }
      }

      // Processar vinhetas de cada curso
      for (const course of courseFolders.values()) {
        const trailer = course.contents.find(c => c.isTrailer)
        course.trailer = trailer ? trailer.path : null
        course.contents = course.contents.filter(c => !c.isTrailer) // Remover vinheta da lista de conteúdo
        discoveredCourses.push(course)
      }

      const totalContents = discoveredCourses.reduce((sum, c) => sum + c.contents.length, 0)

      setCourses(discoveredCourses)
      setDiscoveredAt(new Date().toISOString())

      return {
        courses: discoveredCourses,
        fixed: fixed,
        totalContents: totalContents,
        totalFixed: fixed.length,
        error: null,
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Erro desconhecido'
      setError(errMsg)
      return {
        courses: [],
        fixed: [],
        totalContents: 0,
        totalFixed: 0,
        error: errMsg,
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Também manter compatibilidade com o hook existente
  const syncStatus = useCallback(async (): Promise<DriveSyncStatus | null> => {
    if (!window.__TAURI__) return null

    try {
      const result = await window.__TAURI__.core.invoke<DriveSyncStatus>('drive_sync_status')
      return result
    } catch {
      return null
    }
  }, [])

  const refreshFromDrive = useCallback(async (): Promise<DriveFile[]> => {
    if (!window.__TAURI__) return []

    try {
      const result = await window.__TAURI__.core.invoke<DriveFile[]>('list_synced_files')
      return result || []
    } catch {
      return []
    }
  }, [])

  // Auto-discovery ao carregar
  useEffect(() => {
    let active = true

    const doDiscovery = async () => {
      if (!window.__TAURI__) return

      try {
        const files = await refreshFromDrive()
        if (active) {
          await discover(files)
        }
      } catch {
        if (active) {
          // silencioso
        }
      }
    }

    doDiscovery()

    return () => {
      active = false
    }
  }, [refreshFromDrive, discover])

  return {
    courses,
    fixed,
    loading,
    error,
    discoveredAt,
    discover,
    refreshFromDrive,
    syncStatus,
  }
}

/**
 * Estima a duração do vídeo baseado no tamanho do arquivo
 * Esta é uma estimativa aproximada para efeitos de UI
 * Para vídeos, o tempo real é obtido do player (evento onEnd)
 */
function estimateDuration(_filename: string, type: 'video' | 'image'): number {
  // Para imagens, sempre 15 segundos
  if (type === 'image') return 15000

  // Para vídeos: retorna 0 (duração real obtida do player)
  // A duração será determinada pelo evento de conclusão do player
  return 0
}

/**
 * Hook simplificado para descoberta de cursos
 */
export function useCourseDiscovery() {
  const { courses, loading, error, discover } = useDriveDiscovery()
  
  return {
    courses,
    loading,
    error,
    discover,
    courseCount: courses.length,
    totalContent: courses.reduce((sum, c) => sum + c.contents.length, 0),
  }
}

/**
 * Hook para descoberta de conteúdo fixo
 */
export function useFixedContentDiscovery() {
  const { fixed, loading, error, discover } = useDriveDiscovery()
  
  return {
    fixed,
    loading,
    error,
    discover,
    fixedCount: fixed.length,
  }
}

/**
 * Hook combinado para todas as descobertas
 */
export function useProgrammingDiscovery() {
  const [courses, setCourses] = useState<DiscoveredCourse[]>([])
  const [fixed, setFixed] = useState<TvFixedContent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<{
    totalCourses: number
    totalContent: number
    totalFixed: number
    contentByType: { video: number; image: number }
  }>({ totalCourses: 0, totalContent: 0, totalFixed: 0, contentByType: { video: 0, image: 0 } })

  const discoverAll = useCallback(async (files: DriveFile[]): Promise<DiscoveryResult> => {
    setLoading(true)
    setError(null)

    try {
      // Agrupar por tipo de conteúdo
      // const videoFiles = files.filter(f => getFileType(f.name) === 'video')
      // const imageFiles = files.filter(f => getFileType(f.name) === 'image')

      // Agrupar por pasta
      const courseMap = new Map<string, DiscoveredCourse>()
      const fixedMap = new Map<string, TvFixedContent>()

      for (const file of files) {
        const type = getFileType(file.name)
        if (!type) continue

        const pathParts = file.path.split('\\')
        const isFixed = pathParts.some(p => p.toUpperCase() === 'FIXOS')
        const isCourse = pathParts.some(p => p.toUpperCase() === 'CURSOS')

        if (isFixed && !isCourse) {
          const id = generateId(file.path)
          fixedMap.set(id, {
            id,
            workspace_id: null,
            file_name: file.name,
            file_path: file.path,
            file_type: type,
            duration_seconds: estimateDuration(file.name, type),
            display_count: 0,
            last_displayed: null,
            thumbnail_url: null,
            sort_order: 0,
            is_available: true,
            created_at: new Date().toISOString(),
          })
        } else if (isCourse && !isFixed) {
          const courseName = pathParts[pathParts.length - 1]
          const courseSlug = courseName.toLowerCase().replace(/\s+/g, '-')
          
          if (!courseMap.has(courseSlug)) {
            courseMap.set(courseSlug, {
              id: 'course_' + generateId(file.path),
              name: courseName,
              slug: courseSlug,
              trailer: null,
              contents: [],
            })
          }

          const course = courseMap.get(courseSlug)!
          const content: DiscoveredContent = {
            id: generateId(file.path),
            name: file.name,
            path: file.path,
            type,
            duration: estimateDuration(file.name, type),
            isTrailer: isTrailer(file.name),
          }

          if (content.isTrailer) {
            course.trailer = content.path
          } else {
            course.contents.push(content)
          }
        }
      }

      // Converter mapas para arrays
      const discoveredCourses = Array.from(courseMap.values())
      const discoveredFixed = Array.from(fixedMap.values())

      // Calcular métricas
      const totalVideo = discoveredCourses.reduce((sum, c) => 
        sum + c.contents.filter(item => item.type === 'video').length + 
        (c.trailer ? 1 : 0), 0)
      const totalImages = discoveredCourses.reduce((sum, c) => 
        sum + c.contents.filter(item => item.type === 'image').length, 0)

      const resultMetrics = {
        totalCourses: discoveredCourses.length,
        totalContent: discoveredCourses.reduce((sum, c) => sum + c.contents.length, 0),
        totalFixed: discoveredFixed.length,
        contentByType: { video: totalVideo, image: totalImages },
      }

      setCourses(discoveredCourses)
      setFixed(discoveredFixed)
      setMetrics(resultMetrics)

      return {
        courses: discoveredCourses,
        fixed: discoveredFixed,
        totalContents: resultMetrics.totalContent,
        totalFixed: resultMetrics.totalFixed,
        error: null,
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Erro desconhecido'
      setError(errMsg)
      return {
        courses: [],
        fixed: [],
        totalContents: 0,
        totalFixed: 0,
        error: errMsg,
      }
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    courses,
    fixed,
    loading,
    error,
    metrics,
    discoverAll,
  }
}
