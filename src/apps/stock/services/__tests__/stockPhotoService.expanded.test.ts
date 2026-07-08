import { describe, it, expect, beforeEach } from 'vitest'
import { stockPhotoService } from '../stockPhotoService'

const KEY = 'labhub_stock_photos'

beforeEach(() => {
  localStorage.clear()
})

describe('stockPhotoService (expanded)', () => {
  it('get retorna array vazio para item sem fotos', () => {
    expect(stockPhotoService.get('item-1')).toEqual([])
  })

  it('has retorna false para item sem fotos', () => {
    expect(stockPhotoService.has('item-1')).toBe(false)
  })

  it('count retorna 0 para item sem fotos', () => {
    expect(stockPhotoService.count('item-1')).toBe(0)
  })

  it('add adiciona foto a um item', () => {
    stockPhotoService.add('item-1', 'data:image/jpeg;base64,fake1')
    expect(stockPhotoService.get('item-1')).toHaveLength(1)
    expect(stockPhotoService.has('item-1')).toBe(true)
    expect(stockPhotoService.count('item-1')).toBe(1)
  })

  it('add adiciona múltiplas fotos', () => {
    stockPhotoService.add('item-1', 'data:image/jpeg;base64,fake1')
    stockPhotoService.add('item-1', 'data:image/jpeg;base64,fake2')
    expect(stockPhotoService.get('item-1')).toHaveLength(2)
  })

  it('mantém fotos separadas por item', () => {
    stockPhotoService.add('item-1', 'data:img1')
    stockPhotoService.add('item-2', 'data:img2')
    expect(stockPhotoService.get('item-1')).toHaveLength(1)
    expect(stockPhotoService.get('item-2')).toHaveLength(1)
    expect(stockPhotoService.count('item-1')).toBe(1)
    expect(stockPhotoService.count('item-2')).toBe(1)
  })

  it('setAll substitui todas as fotos', () => {
    stockPhotoService.add('item-1', 'data:old')
    stockPhotoService.setAll('item-1', ['data:new1', 'data:new2'])
    expect(stockPhotoService.get('item-1')).toHaveLength(2)
    expect(stockPhotoService.get('item-1')[0]).toBe('data:new1')
  })

  it('setAll com array vazio remove entrada', () => {
    stockPhotoService.add('item-1', 'data:img')
    stockPhotoService.setAll('item-1', [])
    expect(stockPhotoService.has('item-1')).toBe(false)
  })

  it('removeAt remove foto por índice', () => {
    stockPhotoService.add('item-1', 'data:img1')
    stockPhotoService.add('item-1', 'data:img2')
    stockPhotoService.removeAt('item-1', 0)
    const photos = stockPhotoService.get('item-1')
    expect(photos).toHaveLength(1)
    expect(photos[0]).toBe('data:img2')
  })

  it('removeAt deleta entrada quando remove última foto', () => {
    stockPhotoService.add('item-1', 'data:img')
    stockPhotoService.removeAt('item-1', 0)
    expect(stockPhotoService.has('item-1')).toBe(false)
  })

  it('deleteAll remove todas as fotos do item', () => {
    stockPhotoService.add('item-1', 'data:img')
    stockPhotoService.add('item-1', 'data:img2')
    stockPhotoService.deleteAll('item-1')
    expect(stockPhotoService.has('item-1')).toBe(false)
  })

  it('countOrphans retorna número de itens órfãos', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'item-1': ['img1'], 'item-2': ['img2'], 'item-3': ['img3'] }))
    expect(stockPhotoService.countOrphans(new Set(['item-1']))).toBe(2)
  })

  it('cleanupOrphans remove itens órfãos e retorna contagem', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'item-1': ['img1'], 'item-2': ['img2'], 'item-3': ['img3'] }))
    const removed = stockPhotoService.cleanupOrphans(new Set(['item-1']))
    expect(removed).toBe(2)
    const remaining = JSON.parse(localStorage.getItem(KEY)!)
    expect(Object.keys(remaining)).toEqual(['item-1'])
  })

  it('cleanupOrphans retorna 0 quando não há órfãos', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'item-1': ['img1'] }))
    expect(stockPhotoService.cleanupOrphans(new Set(['item-1']))).toBe(0)
  })

  it('lida com localStorage corrompido', () => {
    localStorage.setItem(KEY, 'invalid json')
    expect(stockPhotoService.get('item-1')).toEqual([])
    expect(stockPhotoService.has('item-1')).toBe(false)
    expect(stockPhotoService.count('item-1')).toBe(0)
    expect(stockPhotoService.countOrphans(new Set())).toBe(0)
    expect(stockPhotoService.cleanupOrphans(new Set())).toBe(0)
  })
})
