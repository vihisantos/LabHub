import { describe, it, expect, beforeEach } from 'vitest'
import { clearCache, resetCache, isReady, getCol, setCol } from '../db'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

describe('clearCache', () => {
  it('limpa o cache de coleções existentes do localStorage', () => {
    localStorage.setItem('labhub_pcs', JSON.stringify([{ id: '1' }]))
    localStorage.setItem('labhub_parts', JSON.stringify([{ id: '2' }]))
    clearCache()
    expect(localStorage.getItem('labhub_pcs')).toBeNull()
    expect(localStorage.getItem('labhub_parts')).toBeNull()
  })

  it('não remove chaves fora do padrão labhub_', () => {
    localStorage.setItem('my_key', 'value')
    clearCache()
    expect(localStorage.getItem('my_key')).toBe('value')
  })
})

describe('resetCache', () => {
  it('reseta o estado ready para false', () => {
    setCol('pcs', [{ id: '1' }])
    expect(isReady()).toBe(false)
    resetCache()
    expect(isReady()).toBe(false)
  })
})

describe('isReady', () => {
  it('retorna false inicialmente', () => {
    expect(isReady()).toBe(false)
  })

  it('retorna false após resetCache', () => {
    resetCache()
    expect(isReady()).toBe(false)
  })
})

describe('getCol / setCol', () => {
  it('getCol retorna array vazio para coleção inexistente', () => {
    expect(getCol('pcs')).toEqual([])
  })

  it('setCol armazena dados e getCol os recupera', () => {
    const data = [{ id: '1', name: 'PC-001' }, { id: '2', name: 'PC-002' }]
    setCol('pcs', data)
    expect(getCol('pcs')).toEqual(data)
  })

  it('setCol substitui dados existentes', () => {
    setCol('pcs', [{ id: '1', name: 'old' }])
    setCol('pcs', [{ id: '2', name: 'new' }])
    expect(getCol('pcs')).toHaveLength(1)
    expect(getCol<{ id: string; name: string }>('pcs')[0].name).toBe('new')
  })

  it('lida com coleções separadas de forma independente', () => {
    setCol('pcs', [{ id: '1' }])
    setCol('parts', [{ id: '2' }])
    expect(getCol('pcs')).toHaveLength(1)
    expect(getCol('parts')).toHaveLength(1)
  })

  it('setCol com array vazio funciona', () => {
    setCol('pcs', [])
    expect(getCol('pcs')).toEqual([])
  })
})

describe('cache permanece entre chamadas sem IndexedDB', () => {
  it('dados persistem no cache em memória', () => {
    setCol('pcs', [{ id: '1' }])
    expect(getCol('pcs')).toHaveLength(1)
  })
})
