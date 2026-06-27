import { partUsageService } from '../partUsageService'

beforeEach(() => {
  localStorage.clear()
})

describe('partUsageService', () => {
  it('log registra uso de peça', () => {
    const usage = partUsageService.log('part-1', 'pc-1', 'Teclado', 2)
    expect(usage.id).toBeDefined()
    expect(usage.partId).toBe('part-1')
    expect(usage.pcId).toBe('pc-1')
    expect(usage.partName).toBe('Teclado')
    expect(usage.quantity).toBe(2)
    expect(usage.timestamp).toBeDefined()
  })

  it('getByPC retorna usos de um PC ordenados por timestamp desc', () => {
    partUsageService.log('part-1', 'pc-1', 'Teclado', 1)
    partUsageService.log('part-2', 'pc-1', 'Mouse', 2)
    partUsageService.log('part-3', 'pc-2', 'Monitor', 1)
    const usages = partUsageService.getByPC('pc-1')
    expect(usages).toHaveLength(2)
    expect(usages.every((u) => u.pcId === 'pc-1')).toBe(true)
  })

  it('getByPartId retorna usos de uma peça', () => {
    partUsageService.log('part-1', 'pc-1', 'Teclado', 1)
    partUsageService.log('part-1', 'pc-2', 'Teclado', 1)
    const usages = partUsageService.getByPartId('part-1')
    expect(usages).toHaveLength(2)
  })

  it('remove deleta registro de uso', () => {
    const usage = partUsageService.log('part-1', 'pc-1', 'Teclado', 1)
    expect(partUsageService.remove(usage.id)).toBe(true)
    expect(partUsageService.getAll()).toHaveLength(0)
  })
})
