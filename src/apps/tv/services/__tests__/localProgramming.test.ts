import { describe, it, expect } from 'vitest'
import { discoverLocalStructure, type LocalMediaFile } from '../localProgramming'

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