/**
 * Tipos específicos para programação acadêmica
 * Separação de responsabilidades
 */

export interface AcademicContentItem {
  id: string
  courseId: string
  courseName: string
  fileName: string
  filePath: string
  fileType: 'video' | 'image'
  duration: number
  isTrailer: boolean
  isCompleted: boolean
  completedAt?: string
}

export interface FixedContentItem {
  id: string
  fileName: string
  filePath: string
  fileType: 'video' | 'image'
  duration: number
  displayCount: number
  lastDisplayed?: string
  isAvailable: boolean
}

export interface ProgrammingQueueEntry {
  id: string
  type: 'academic' | 'fixed'
  course?: {
    id: string
    name: string
  }
  file: {
    path: string
    name: string
    type: 'video' | 'image'
    duration: number
  }
  isTrailer: boolean
  isFixed: boolean
}

export interface ProgrammingProgress {
  totalAcademic: number
  completedAcademic: number
  pendingAcademic: number
  withErrors: number
  totalFixed: number
  availableFixed: number
  cyclePercent: number
}

export interface ProgrammingStateSerialized {
  /** Versão do ciclo atual */
  cycleVersion: number

  /** Posição atual na fila */
  currentPosition: number

  /** Total de unidades acadêmicas concluídas */
  academicCompletedCount: number

  /** Unidades desde o último comercial */
  academicSinceLastCommercial: number

  /** IDs de conteúdo concluído no ciclo (para evitar repetição) */
  completedContentIds: string[]

  /** Próximo ID de comercial a ser inserido */
  nextCommercialId: string | null

  /** Versão/hash da biblioteca de conteúdo */
  libraryVersion: string

  /** IDs pendentes na fila (em ordem embaralhada) */
  pendingQueueIds: string[]

  /** Erros registrados */
  errorContentIds: string[]
}

export interface DriveFolderConfig {
  rootPath: string
  coursesFolder: string
  fixedFolder: string
  labhubTvName: string
}

export interface DiscoveredCourseFolder {
  id: string
  name: string
  slug: string
  path: string
  contentType: 'cursos' | 'other'
}

export interface DiscoveredMediaFile {
  name: string
  path: string
  size: number
  type: 'video' | 'image'
  extension: string
  isTrailer: boolean
  duration: number
  lastModified: string
}

export interface ContentSyncResult {
  courses: DiscoveredCourseFolder[]
  academicFiles: DiscoveredMediaFile[]
  fixedFiles: DiscoveredMediaFile[]
  errors: string[]
}