/**
 * Testes para descoberta automática de conteúdo do Google Drive
 *
 * Cobertura:
 * - Detecção de estrutura de pastas (Cursos/, Fixos/)
 * - Identificação de vinhetas
 * - Agrupamento por cursos
 * - Tratamento de arquivos inválidos
 */

import { describe, it, expect } from 'vitest'

interface MockDriveFile {
  name: string
  size: number
  path: string
  file_type: 'video' | 'image'
}

interface DiscoveredCourse {
  id: string
  name: string
  slug: string
  trailer: string | null
  contents: DiscoveredContent[]
}

interface DiscoveredContent {
  id: string
  name: string
  path: string
  type: 'video' | 'image'
  duration: number
  isTrailer: boolean
}

// Extensões suportadas
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

function getFileType(filename: string): 'video' | 'image' | null {
  const ext = '.' + filename.split('.').pop()?.toLowerCase() || ''
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  return null
}

function isTrailer(filename: string): boolean {
  // Convenção oficial: VINHETA.mp4 (case-insensitive, sem sufixo)
  const upper = filename.toUpperCase()
  const baseName = upper.split('.')[0]
  return baseName === 'VINHETA'
}

function generateId(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return 'drive_' + Math.abs(hash).toString(36)
}

function discoverCourses(files: MockDriveFile[]): DiscoveredCourse[] {
  const courseMap = new Map<string, DiscoveredCourse>()

  for (const file of files) {
    const type = getFileType(file.name)
    if (!type) continue

    const pathParts = file.path.split('\\')
    
    // Detectar pasta de cursos
    const cursosIndex = pathParts.findIndex(p => p.toUpperCase() === 'CURSOS')
    if (cursosIndex === -1 || cursosIndex === pathParts.length - 1) continue

    const courseName = pathParts[cursosIndex + 1] || ''
    if (!courseName) continue

    const courseSlug = courseName.toLowerCase().replace(/\s+/g, '-')
    
    if (!courseMap.has(courseSlug)) {
      courseMap.set(courseSlug, {
        id: generateId(file.path),
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
      duration: 0,
      isTrailer: isTrailer(file.name),
    }

    if (content.isTrailer) {
      course.trailer = content.path
    } else {
      course.contents.push(content)
    }
  }

  return Array.from(courseMap.values())
}

describe('Drive Discovery', () => {
  describe('FileType Detection', () => {
    it('identifica corretamente vídeos comuns', () => {
      expect(getFileType('video.mp4')).toBe('video')
      expect(getFileType('VIDEO.MP4')).toBe('video')
      expect(getFileType('movie.mov')).toBe('video')
      expect(getFileType('clip.avi')).toBe('video')
      expect(getFileType('stream.webm')).toBe('video')
    })

    it('identifica corretamente imagens', () => {
      expect(getFileType('photo.jpg')).toBe('image')
      expect(getFileType('PHOTO.JPEG')).toBe('image')
      expect(getFileType('image.png')).toBe('image')
      expect(getFileType('animation.gif')).toBe('image')
    })

    it('retorna null para arquivos não suportados', () => {
      expect(getFileType('document.pdf')).toBeNull()
      expect(getFileType('archive.zip')).toBeNull()
      expect(getFileType('script.js')).toBeNull()
      expect(getFileType('README')).toBeNull()
    })

    it('ignora pastas', () => {
      expect(getFileType('')).toBeNull()
    })
  })

  describe('Trailer Detection', () => {
    it('identifica vinhetas pelo nome exato VINHETA.mp4 (case-insensitive)', () => {
      expect(isTrailer('VINHETA.mp4')).toBe(true)
      expect(isTrailer('vINHETA.mp4')).toBe(true)
      expect(isTrailer('VINHETA.MP4')).toBe(true)
      expect(isTrailer('VINHETA.jpg')).toBe(true)
    })

    it('não confunde conteúdo normal com vinheta', () => {
      expect(isTrailer('DIREITO_01.mp4')).toBe(false)
      expect(isTrailer('VINHETA_DIREITO.mp4')).toBe(false)
      expect(isTrailer('BIOMED_02.jpg')).toBe(false)
      expect(isTrailer('VIDEO_COM_UNDERSCORE.mp4')).toBe(false)
      expect(isTrailer('CONTEUDO_001.mp4')).toBe(false)
      expect(isTrailer('trailer.mp4')).toBe(false)
    })
  })

  describe('Course Discovery', () => {
    it('descobre cursos da estrutura correta', () => {
      const files: MockDriveFile[] = [
        { name: 'VINHETA.mp4', path: 'G:\\LabHub-TV\\Cursos\\Direito\\VINHETA.mp4', size: 1000, file_type: 'video' },
        { name: 'CONTEUDO_001.mp4', path: 'G:\\LabHub-TV\\Cursos\\Direito\\CONTEUDO_001.mp4', size: 2000, file_type: 'video' },
        { name: 'CONTEUDO_002.jpg', path: 'G:\\LabHub-TV\\Cursos\\Direito\\CONTEUDO_002.jpg', size: 500, file_type: 'image' },
        { name: 'VINHETA.mp4', path: 'G:\\Labhub-TV\\Cursos\\Biomedicina\\VINHETA.mp4', size: 1000, file_type: 'video' },
        { name: 'CONTEUDO_001.mp4', path: 'G:\\Labhub-TV\\Cursos\\Biomedicina\\CONTEUDO_001.mp4', size: 2000, file_type: 'video' },
      ]

      const courses = discoverCourses(files)

      expect(courses).toHaveLength(2)
      expect(courses.find(c => c.slug === 'direito')).toBeDefined()
      expect(courses.find(c => c.slug === 'biomedicina')).toBeDefined()
    })

    it('vinheta é separada dos conteúdos normais', () => {
      const files: MockDriveFile[] = [
        { name: 'VINHETA.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\VINHETA.mp4', size: 1000, file_type: 'video' },
        { name: 'CONTEUDO_001.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONTEUDO_001.mp4', size: 2000, file_type: 'video' },
        { name: 'CONTEUDO_002.jpg', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONTEUDO_002.jpg', size: 500, file_type: 'image' },
      ]

      const courses = discoverCourses(files)
      const direito = courses.find(c => c.slug === 'direito')

      expect(direito?.trailer).toBe('G:\\Labhub-TV\\Cursos\\Direito\\VINHETA.mp4')
      expect(direito?.contents).toHaveLength(2)
      expect(direito?.contents.map(c => c.isTrailer)).toEqual([false, false])
    })

    it('ignora arquivos fora de Cursos/', () => {
      const files: MockDriveFile[] = [
        { name: 'random.mp4', path: 'G:\\Labhub-TV\\random.mp4', size: 1000, file_type: 'video' },
        { name: 'CONTEUDO_001.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONTEUDO_001.mp4', size: 2000, file_type: 'video' },
      ]

      const courses = discoverCourses(files)

      expect(courses).toHaveLength(1)
      expect(courses[0].contents).toHaveLength(1)
    })

    it('gerencia múltiplos cursos com diferentes conteúdos', () => {
      const files: MockDriveFile[] = [
        { name: 'VINHETA.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\VINHETA.mp4', size: 1000, file_type: 'video' },
        { name: 'CONTEUDO_001.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONTEUDO_001.mp4', size: 2000, file_type: 'video' },
        { name: 'VINHETA.mp4', path: 'G:\\Labhub-TV\\Cursos\\Enfermagem\\VINHETA.mp4', size: 1000, file_type: 'video' },
        { name: 'CONTEUDO_001.mp4', path: 'G:\\Labhub-TV\\Cursos\\Enfermagem\\CONTEUDO_001.mp4', size: 3000, file_type: 'video' },
        { name: 'CONTEUDO_002.jpg', path: 'G:\\Labhub-TV\\Cursos\\Enfermagem\\CONTEUDO_002.jpg', size: 500, file_type: 'image' },
      ]

      const courses = discoverCourses(files)

      expect(courses).toHaveLength(2)
      
      const direito = courses.find(c => c.slug === 'direito')
      expect(direito?.contents).toHaveLength(1)
      
      const enfermagem = courses.find(c => c.slug === 'enfermagem')
      expect(enfermagem?.contents).toHaveLength(2)
    })

    it('trata arquivos sem vinheta', () => {
      const files: MockDriveFile[] = [
        { name: 'CONTEUDO_001.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONTEUDO_001.mp4', size: 2000, file_type: 'video' },
        { name: 'CONTEUDO_002.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONTEUDO_002.mp4', size: 2000, file_type: 'video' },
      ]

      const courses = discoverCourses(files)

      expect(courses).toHaveLength(1)
      expect(courses[0].trailer).toBeNull()
      expect(courses[0].contents).toHaveLength(2)
    })

    it('gera IDs únicos para cada conteúdo', () => {
      // Verify that content IDs are unique
      const files: MockDriveFile[] = [
        { name: 'VIDEO_A.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\VIDEO_A.mp4', size: 2000, file_type: 'video' },
        { name: 'VIDEO_B.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\VIDEO_B.mp4', size: 2000, file_type: 'video' },
      ]

      const courses = discoverCourses(files)
      expect(courses).toHaveLength(1)
      
      // Content IDs should be unique
      const contentIds = courses[0].contents.map(c => c.id)
      const uniqueContentIds = new Set(contentIds)
      expect(uniqueContentIds.size).toBe(contentIds.length)
    })
  })

  describe('Fixed Content Discovery', () => {
    function discoverFixed(files: MockDriveFile[]): { id: string; name: string; path: string; type: 'video' | 'image' }[] {
      const fixed: { id: string; name: string; path: string; type: 'video' | 'image' }[] = []

      for (const file of files) {
        const type = getFileType(file.name)
        if (!type) continue

        const pathParts = file.path.split('\\')
        if (!pathParts.some(p => p.toUpperCase() === 'FIXOS')) continue

        fixed.push({
          id: generateId(file.path),
          name: file.name,
          path: file.path,
          type,
        })
      }

      return fixed
    }

    it('descobre conteúdo fixo da pasta correta', () => {
      const files: MockDriveFile[] = [
        { name: 'comercial1.mp4', path: 'G:\\Labhub-TV\\Fixos\\comercial1.mp4', size: 1000, file_type: 'video' },
        { name: 'logo.mp4', path: 'G:\\Labhub-TV\\Fixos\\logo.mp4', size: 500, file_type: 'video' },
        { name: 'banner.jpg', path: 'G:\\Labhub-TV\\Fixos\\banner.jpg', size: 300, file_type: 'image' },
        { name: 'video.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\video.mp4', size: 2000, file_type: 'video' },
      ]

      const fixed = discoverFixed(files)

      expect(fixed).toHaveLength(3)
      expect(fixed.every(f => f.path.includes('Fixos'))).toBe(true)
    })

    it('não inclui conteúdo de cursos', () => {
      const files: MockDriveFile[] = [
        { name: 'comercial1.mp4', path: 'G:\\Labhub-TV\\Fixos\\comercial1.mp4', size: 1000, file_type: 'video' },
        { name: 'CONTEUDO_001.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONTEUDO_001.mp4', size: 2000, file_type: 'video' },
        { name: 'VINHETA.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\VINHETA.mp4', size: 1000, file_type: 'video' },
      ]

      const fixed = discoverFixed(files)

      expect(fixed).toHaveLength(1)
      expect(fixed[0].name).toBe('comercial1.mp4')
    })
  })

  describe('Integration Tests', () => {
    it('descoberta completa de estrutura realista', () => {
      const files: MockDriveFile[] = [
        // Fixos
        { name: 'comercial-institucional.mp4', path: 'G:\\Labhub-TV\\Fixos\\comercial-institucional.mp4', size: 10_000_000, file_type: 'video' },
        { name: 'logo-animada.mp4', path: 'G:\\Labhub-TV\\Fixos\\logo-animada.mp4', size: 5_000_000, file_type: 'video' },
        { name: 'campanha1.jpg', path: 'G:\\Labhub-TV\\Fixos\\campanhas\\campanha1.jpg', size: 500_000, file_type: 'image' },
        
        // Direito
        { name: 'VINHETA.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\VINHETA.mp4', size: 3_000_000, file_type: 'video' },
        { name: 'CONT1.mp4', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONT1.mp4', size: 10_000_000, file_type: 'video' },
        { name: 'CONT2.jpg', path: 'G:\\Labhub-TV\\Cursos\\Direito\\CONT2.jpg', size: 800_000, file_type: 'image' },
        
        // Biomedicina
        { name: 'VINHETA.mp4', path: 'G:\\Labhub-TV\\Cursos\\Biomedicina\\VINHETA.mp4', size: 3_000_000, file_type: 'video' },
        { name: 'BIO1.mp4', path: 'G:\\Labhub-TV\\Cursos\\Biomedicina\\BIO1.mp4', size: 12_000_000, file_type: 'video' },
        { name: 'BIO2.jpg', path: 'G:\\Labhub-TV\\Cursos\\Biomedicina\\BIO2.jpg', size: 900_000, file_type: 'image' },
        
        // Enfermagem
        { name: 'VINHETA.mp4', path: 'G:\\Labhub-TV\\Cursos\\Enfermagem\\VINHETA.mp4', size: 3_000_000, file_type: 'video' },
        { name: 'ENF1.mp4', path: 'G:\\Labhub-TV\\Cursos\\Enfermagem\\ENF1.mp4', size: 8_000_000, file_type: 'video' },
      ]

      const courses = discoverCourses(files)
      const fixedContent = files.filter(f => f.path.includes('Fixos') && getFileType(f.name))

      expect(courses).toHaveLength(3)
      expect(courses.map(c => c.name).sort()).toEqual(['Biomedicina', 'Direito', 'Enfermagem'])
      
      expect(courses.find(c => c.slug === 'direito')?.trailer).toBe('G:\\Labhub-TV\\Cursos\\Direito\\VINHETA.mp4')
      expect(courses.find(c => c.slug === 'biomedicina')?.trailer).toBe('G:\\Labhub-TV\\Cursos\\Biomedicina\\VINHETA.mp4')
      expect(courses.find(c => c.slug === 'enfermagem')?.trailer).toBe('G:\\Labhub-TV\\Cursos\\Enfermagem\\VINHETA.mp4')

      const totalContents = courses.reduce((sum, c) => sum + c.contents.length, 0)
      expect(totalContents).toBe(5)

      expect(fixedContent).toHaveLength(3)
    })

    it('handleDrivePathVariants', () => {
      const file1: MockDriveFile = {
        name: 'VINHETA.mp4',
        path: 'G:\\Meu Drive\\LabHub-TV\\Cursos\\Direito\\VINHETA.mp4',
        size: 3_000_000,
        file_type: 'video'
      }

      const courses = discoverCourses([file1])
      expect(courses).toHaveLength(1)
      expect(courses[0].name).toBe('Direito')
    })
  })
})