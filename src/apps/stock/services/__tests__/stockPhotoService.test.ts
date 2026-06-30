import { describe, it, expect, beforeEach } from 'vitest'
import { stockPhotoService } from '../stockPhotoService'

beforeEach(() => {
  localStorage.clear()
})

describe('stockPhotoService', () => {
  describe('CRUD', () => {
    it('get retorna array vazio para item sem fotos', () => {
      expect(stockPhotoService.get('inexistente')).toEqual([])
    })

    it('add salva e get retorna a foto', () => {
      stockPhotoService.add('item-1', 'data:image/jpeg;base64,fake1')
      expect(stockPhotoService.get('item-1')).toEqual(['data:image/jpeg;base64,fake1'])
    })

    it('has retorna true/false', () => {
      expect(stockPhotoService.has('item-1')).toBe(false)
      stockPhotoService.add('item-1', 'data:image/jpeg;base64,fake')
      expect(stockPhotoService.has('item-1')).toBe(true)
    })

    it('count retorna quantidade correta', () => {
      expect(stockPhotoService.count('item-1')).toBe(0)
      stockPhotoService.add('item-1', 'data:image/jpeg;base64,a')
      stockPhotoService.add('item-1', 'data:image/jpeg;base64,b')
      stockPhotoService.add('item-1', 'data:image/jpeg;base64,c')
      expect(stockPhotoService.count('item-1')).toBe(3)
    })

    it('setAll substitui todas as fotos', () => {
      stockPhotoService.add('item-1', 'data:old')
      stockPhotoService.setAll('item-1', ['data:new1', 'data:new2'])
      expect(stockPhotoService.get('item-1')).toEqual(['data:new1', 'data:new2'])
    })

    it('setAll com array vazio deleta a entrada', () => {
      stockPhotoService.add('item-1', 'data:image/jpeg;base64,x')
      stockPhotoService.setAll('item-1', [])
      expect(stockPhotoService.has('item-1')).toBe(false)
    })

    it('removeAt remove pelo índice', () => {
      stockPhotoService.setAll('item-1', ['data:a', 'data:b', 'data:c'])
      stockPhotoService.removeAt('item-1', 1)
      expect(stockPhotoService.get('item-1')).toEqual(['data:a', 'data:c'])
    })

    it('removeAt deleta entrada se remover a última foto', () => {
      stockPhotoService.add('item-1', 'data:only')
      stockPhotoService.removeAt('item-1', 0)
      expect(stockPhotoService.has('item-1')).toBe(false)
    })

    it('deleteAll remove entrada completamente', () => {
      stockPhotoService.add('item-1', 'data:something')
      stockPhotoService.deleteAll('item-1')
      expect(stockPhotoService.has('item-1')).toBe(false)
      expect(stockPhotoService.get('item-1')).toEqual([])
    })

    it('múltiplos itens são independentes', () => {
      stockPhotoService.add('a', 'data:a')
      stockPhotoService.add('b', 'data:b1')
      stockPhotoService.add('b', 'data:b2')
      expect(stockPhotoService.count('a')).toBe(1)
      expect(stockPhotoService.count('b')).toBe(2)
      stockPhotoService.deleteAll('a')
      expect(stockPhotoService.has('a')).toBe(false)
      expect(stockPhotoService.count('b')).toBe(2)
    })
  })

  describe('cleanupOrphans', () => {
    it('countOrphans retorna 0 quando todas as fotos têm IDs válidos', () => {
      stockPhotoService.setAll('id-1', ['data:a'])
      stockPhotoService.setAll('id-2', ['data:b'])
      const valid = new Set(['id-1', 'id-2'])
      expect(stockPhotoService.countOrphans(valid)).toBe(0)
    })

    it('countOrphans conta apenas IDs órfãos', () => {
      stockPhotoService.setAll('id-1', ['data:a'])
      stockPhotoService.setAll('id-2', ['data:b'])
      stockPhotoService.setAll('id-orphan', ['data:c'])
      const valid = new Set(['id-1', 'id-2'])
      expect(stockPhotoService.countOrphans(valid)).toBe(1)
    })

    it('cleanupOrphans remove apenas entradas órfãs', () => {
      stockPhotoService.setAll('id-1', ['data:a'])
      stockPhotoService.setAll('id-2', ['data:b'])
      stockPhotoService.setAll('id-orphan', ['data:c'])
      stockPhotoService.setAll('other-orphan', ['data:d'])

      const cleaned = stockPhotoService.cleanupOrphans(new Set(['id-1', 'id-2']))
      expect(cleaned).toBe(2)
      expect(stockPhotoService.has('id-1')).toBe(true)
      expect(stockPhotoService.has('id-2')).toBe(true)
      expect(stockPhotoService.has('id-orphan')).toBe(false)
      expect(stockPhotoService.has('other-orphan')).toBe(false)
    })

    it('cleanupOrphans retorna 0 se não há órfãos', () => {
      stockPhotoService.setAll('id-1', ['data:a'])
      const cleaned = stockPhotoService.cleanupOrphans(new Set(['id-1']))
      expect(cleaned).toBe(0)
      expect(stockPhotoService.has('id-1')).toBe(true)
    })

    it('cleanupOrphans com store vazio retorna 0', () => {
      const cleaned = stockPhotoService.cleanupOrphans(new Set(['id-1']))
      expect(cleaned).toBe(0)
    })

    it('countOrphans com store vazio retorna 0', () => {
      expect(stockPhotoService.countOrphans(new Set(['id-1']))).toBe(0)
    })
  })
})
