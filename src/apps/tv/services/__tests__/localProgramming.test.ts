import { describe, it, expect } from 'vitest'
import { buildLocalQueue, discoverLocalStructure, libraryFingerprint, type LocalMediaFile } from '../localProgramming'

/**
 * Testes para a descoberta de estrutura local do Google Drive.
 * Valida a correção para lidar com caminhos onde relativePath pode ser null.
 */

describe('localProgramming.discoverLocalStructure', () => {
  describe('com relativePath válido', () => {
    it('identifica corretamente os cursos com estrutura Cursos/<NomeCurso>/<arquivo>', () => {
      const files: LocalMediaFile[] = [
        {
          name: 'VINHETA.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Cursos\\Direito\\VINHETA.mp4',
          relativePath: 'Cursos\\Direito\\VINHETA.mp4',
          fileType: 'video',
          size: 3000000
        },
        {
          name: 'CONTEUDO_001.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Cursos\\Direito\\CONTEUDO_001.mp4',
          relativePath: 'Cursos\\Direito\\CONTEUDO_001.mp4',
          fileType: 'video',
          size: 10000000
        },
      ]

      const result = discoverLocalStructure(files)

      expect(result.courses).toHaveLength(1)
      expect(result.courses[0].name).toBe('Direito')
      expect(result.courses[0].trailer).toBe('G:\\Meu Drive\\LabHub -TV\\Cursos\\Direito\\VINHETA.mp4')
      expect(result.courses[0].contents).toHaveLength(1)
    })

    it('identifica conteúdo fixo em Fixos/', () => {
      const files: LocalMediaFile[] = [
        {
          name: 'comercial.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Fixos\\comercial.mp4',
          relativePath: 'Fixos\\comercial.mp4',
          fileType: 'video',
          size: 5000000
        },
      ]

      const result = discoverLocalStructure(files)

      expect(result.fixed).toHaveLength(1)
      expect(result.fixed[0].file_path).toBe('G:\\Meu Drive\\LabHub -TV\\Fixos\\comercial.mp4')
    })

    it('identifica informativos em Informativos/', () => {
      const files: LocalMediaFile[] = [
        {
          name: 'comunicado.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Informativos\\comunicado.mp4',
          relativePath: 'Informativos\\comunicado.mp4',
          fileType: 'video',
          size: 2000000
        },
      ]

      const result = discoverLocalStructure(files)

      expect(result.informativos).toHaveLength(1)
    })
  })

  describe('com relativePath null (fallback para caminho absoluto)', () => {
    it('identifica cursos usando caminho absoluto quando relativePath é null', () => {
      const files: LocalMediaFile[] = [
        {
          name: 'VINHETA.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Cursos\\Direito\\VINHETA.mp4',
          relativePath: null, // Caso crítico: strip_prefix falhou
          fileType: 'video',
          size: 3000000
        },
        {
          name: 'CONTEUDO_001.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Cursos\\Direito\\CONTEUDO_001.mp4',
          relativePath: null,
          fileType: 'video',
          size: 10000000
        },
      ]

      const result = discoverLocalStructure(files)

      expect(result.courses).toHaveLength(1)
      expect(result.courses[0].name).toBe('Direito')
      expect(result.courses[0].trailer).toBe('G:\\Meu Drive\\LabHub -TV\\Cursos\\Direito\\VINHETA.mp4')
      expect(result.courses[0].contents).toHaveLength(1)
    })

    it('identifica fixos usando caminho absoluto quando relativePath é null', () => {
      const files: LocalMediaFile[] = [
        {
          name: 'comercial.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Fixos\\comercial.mp4',
          relativePath: null,
          fileType: 'video',
          size: 5000000
        },
      ]

      const result = discoverLocalStructure(files)

      expect(result.fixed).toHaveLength(1)
      expect(result.fixed[0].file_path).toBe('G:\\Meu Drive\\LabHub -TV\\Fixos\\comercial.mp4')
    })

    it('identifica informativos usando caminho absoluto quando relativePath é null', () => {
      const files: LocalMediaFile[] = [
        {
          name: 'comunicado.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Informativos\\comunicado.mp4',
          relativePath: null,
          fileType: 'video',
          size: 2000000
        },
      ]

      const result = discoverLocalStructure(files)

      expect(result.informativos).toHaveLength(1)
    })
  })

  describe('com múltiplos cursos', () => {
    it('identifica múltiplos cursos corretamente', () => {
      const files: LocalMediaFile[] = [
        {
          name: 'VINHETA.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Cursos\\Direito\\VINHETA.mp4',
          relativePath: 'Cursos\\Direito\\VINHETA.mp4',
          fileType: 'video',
          size: 3000000
        },
        {
          name: 'CONTEUDO_001.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Cursos\\Direito\\CONTEUDO_001.mp4',
          relativePath: 'Cursos\\Direito\\CONTEUDO_001.mp4',
          fileType: 'video',
          size: 10000000
        },
        {
          name: 'VINHETA.mp4',
          path: 'G:\\Meu Drive\\LabHub -TV\\Cursos\\Biomedicina\\VINHETA.mp4',
          relativePath: 'Cursos\\Biomedicina\\VINHETA.mp4',
          fileType: 'video',
          size: 3000000
        },
      ]

      const result = discoverLocalStructure(files)

      expect(result.courses).toHaveLength(2)
      expect(result.courses.find(c => c.name === 'Direito')).toBeDefined()
      expect(result.courses.find(c => c.name === 'Biomedicina')).toBeDefined()
    })
  })

  describe('com estrutura com G:\\ sem Meu Drive', () => {
    it('identifica cursos com caminho diferente', () => {
      const files: LocalMediaFile[] = [
        {
          name: 'VINHETA.mp4',
          path: 'G:\\LabHub-TV\\Cursos\\Odontologia\\VINHETA.mp4',
          relativePath: null,
          fileType: 'video',
          size: 3000000
        },
      ]

      const result = discoverLocalStructure(files)

      expect(result.courses).toHaveLength(1)
      expect(result.courses[0].name).toBe('Odontologia')
    })
  })
})

describe('imagens na biblioteca local', () => {
  const image = (relativePath: string): LocalMediaFile => ({
    name: relativePath.split('/').pop()!, path: 'G:/LabHub-TV/' + relativePath,
    relativePath, fileType: 'image', size: 2048,
  })
  it('inclui imagens acadêmicas, fixas, informativas e de galeria; ignora a raiz', () => {
    const files = ['Cursos/Direito/foto.jpg', 'Fixos/banner.png', 'Informativos/aviso.webp', 'Galerias/Evento/foto.jpeg', 'raiz.png'].map(image)
    const result = discoverLocalStructure(files)
    const queue = buildLocalQueue(result.courses, [])
    expect(queue.map(item => item.file_name)).toEqual(['foto.jpg'])
    expect(queue[0]).toMatchObject({ file_type: 'image', duration_seconds: 15 })
    expect(result.fixed[0]).toMatchObject({ file_type: 'image', duration_seconds: 15 })
    expect(result.informativos[0]).toMatchObject({ file_type: 'image', duration_seconds: 15 })
    expect(result.photosMap[result.galleries[0].id]).toHaveLength(1)
  })
  it('não interpreta imagem chamada VINHETA como vídeo', () => {
    const result = discoverLocalStructure([image('Cursos/Direito/VINHETA.png')])
    expect(result.courses[0].trailer).toBeNull()
    expect(buildLocalQueue(result.courses, [])).toHaveLength(1)
  })
  it('ignora imagem na raiz inclusive no fallback absoluto', () => {
    expect(discoverLocalStructure([{ ...image('raiz.png'), relativePath: null }]).totalContents).toBe(0)
  })
  it('detecta alteração de mesmo tamanho e não depende da ordem do scan', () => {
    const a = image('Cursos/Direito/a.jpg')
    const b = image('Cursos/Direito/b.jpg')
    expect(libraryFingerprint([a,b])).toBe(libraryFingerprint([b,a]))
    expect(libraryFingerprint([{...a, modifiedAt: 1}])).not.toBe(libraryFingerprint([{...a, modifiedAt: 2}]))
  })
})

describe('descoberta de Fixos e Informativos em subpastas', () => {
  const file = (relativePath: string | null, path?: string): LocalMediaFile => ({
    name: (relativePath ?? path ?? '').split(/[\\/]/).pop()!,
    path: path ?? `G:/LabHub-TV/${relativePath}`,
    relativePath,
    fileType: String(relativePath ?? path).endsWith('.mp4') ? 'video' : 'image',
    size: 2048,
  })

  it('encontra arquivos em subpastas dentro de Fixos/ e Informativos/', () => {
    const result = discoverLocalStructure([
      file('Fixos/campanhas/zeta.mp4'),
      file('Informativos/2026/aviso.jpg'),
    ])
    expect(result.fixed.map(f => f.file_name)).toEqual(['zeta.mp4'])
    expect(result.informativos.map(f => f.file_name)).toEqual(['aviso.jpg'])
  })

  it('não perde categorias quando relativePath é null e não há LabHub no caminho', () => {
    const result = discoverLocalStructure([
      file(null, 'G:/Meu Drive/Informativos/aviso.mp4'),
      file(null, 'G:/Meu Drive/Fixos/banner.mp4'),
    ])
    expect(result.informativos.map(f => f.file_name)).toEqual(['aviso.mp4'])
    expect(result.fixed.map(f => f.file_name)).toEqual(['banner.mp4'])
  })

  it('um arquivo chamado labhub.mp4 não é confundido com a pasta raiz', () => {
    const result = discoverLocalStructure([
      file(null, 'G:/Meu Drive/LabHub-TV/Fixos/labhub.mp4'),
    ])
    expect(result.fixed.map(f => f.file_name)).toEqual(['labhub.mp4'])
  })

  it('a primeira categoria do caminho decide: Fixos dentro de Cursos é acadêmico', () => {
    const result = discoverLocalStructure([
      file('Cursos/Direito/Fixos/logo.mp4'),
      file('Cursos/Direito/aula.mp4'),
    ])
    expect(result.fixed).toHaveLength(0)
    expect(result.informativos).toHaveLength(0)
    expect(buildLocalQueue(result.courses, []).map(i => i.file_name).sort()).toEqual(['aula.mp4', 'logo.mp4'])
  })

  it('ignora arquivos soltos na raiz e preserva maiúsculas na extensão', () => {
    const result = discoverLocalStructure([
      file('raiz.mp4', 'G:/LabHub-TV/raiz.mp4'),
      file('Fixos/banner.MP4'),
    ])
    expect(result.fixed.map(f => f.file_name)).toEqual(['banner.MP4'])
  })
})
