import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { resetCache } from '../../../../lib/db'
import { useStock } from '../useStock'
import { stockService } from '../../services/stockService'

beforeEach(() => {
  resetCache()
  localStorage.clear()
})

describe('useStock', () => {
  it('items é array vazio inicialmente', () => {
    const { result } = renderHook(() => useStock())
    expect(result.current.items).toEqual([])
  })

  it('loading é false após o carregamento inicial', () => {
    const { result } = renderHook(() => useStock())
    // O useEffect roda sincronamente e define loading como false
    expect(result.current.loading).toBe(false)
  })

  it('create adiciona item à lista', () => {
    const { result } = renderHook(() => useStock())
    act(() => {
      result.current.create({
        name: 'Mouse',
        section: 'perifericos',
        subcategory: 'Mouse',
        serialNumber: 'SN-001',
        room: 'Lab 1',
        status: 'ativo',
        condition: 'Bom',
        notes: '',
        cableType: '',
        cableLength: '',
        connectorType: '',
        outletCount: undefined,
        linkedPcId: undefined,
        linkedPcLabel: undefined,
        pcParts: undefined,
      })
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].name).toBe('Mouse')
  })

  it('create retorna o item criado', () => {
    const { result } = renderHook(() => useStock())
    let item: any
    act(() => {
      item = result.current.create({
        name: 'Teclado',
        section: 'perifericos',
        subcategory: 'Teclado',
        serialNumber: 'SN-002',
        room: 'Lab 2',
        status: 'ativo',
        condition: 'Bom',
        notes: '',
        cableType: '',
        cableLength: '',
        connectorType: '',
        outletCount: undefined,
        linkedPcId: undefined,
        linkedPcLabel: undefined,
        pcParts: undefined,
      })
    })
    expect(item.name).toBe('Teclado')
    expect(item.id).toBeDefined()
  })

  it('update modifica item existente', () => {
    const { result } = renderHook(() => useStock())
    let createdId: string = ''
    act(() => {
      const item = result.current.create({
        name: 'Monitor', section: 'maquinas', subcategory: 'Monitor',
        serialNumber: '', room: '', status: 'ativo', condition: 'Bom', notes: '',
        cableType: '', cableLength: '', connectorType: '', outletCount: undefined,
        linkedPcId: undefined, linkedPcLabel: undefined, pcParts: undefined,
      })
      createdId = item.id
    })
    act(() => {
      result.current.update(createdId, { room: 'Sala 5' })
    })
    expect(result.current.items[0].room).toBe('Sala 5')
  })

  it('remove deleta item', () => {
    const { result } = renderHook(() => useStock())
    let createdId: string = ''
    act(() => {
      const item = result.current.create({
        name: 'To Delete', section: 'outros', subcategory: '', serialNumber: '',
        room: '', status: 'ativo', condition: 'Bom', notes: '',
        cableType: '', cableLength: '', connectorType: '', outletCount: undefined,
        linkedPcId: undefined, linkedPcLabel: undefined, pcParts: undefined,
      })
      createdId = item.id
    })
    act(() => {
      result.current.remove(createdId)
    })
    expect(result.current.items).toHaveLength(0)
  })

  it('reload recarrega dados', () => {
    const { result } = renderHook(() => useStock())
    // Adiciona item externamente
    act(() => {
      stockService.create({
        name: 'External Item', section: 'cabos', subcategory: 'Cabo HDMI',
        serialNumber: '', room: '', status: 'ativo', condition: 'Bom', notes: '',
        cableType: '', cableLength: '', connectorType: '', outletCount: undefined,
        linkedPcId: undefined, linkedPcLabel: undefined, pcParts: undefined,
      })
    })
    act(() => {
      result.current.reload()
    })
    expect(result.current.items).toHaveLength(1)
  })
})
