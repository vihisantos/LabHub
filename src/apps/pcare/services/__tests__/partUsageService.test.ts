import { describe, it, expect } from 'vitest'
import { partUsageService } from '../partUsageService'
import { setCol } from '../../../../lib/db'
import type { PartUsage } from '../../types/partUsage'

// F2-D-N2: `log`/`remove` saíram (guardavam escrita com o gate legado
// `requireWrite`, que decidia por Role.appAccess/profiles.app_access). A
// cobertura de LEITURA — que é o que a produção consome — é preservada, semeando
// a coleção direto.
function usage(overrides: Partial<PartUsage> = {}): PartUsage {
  return {
    id: 'u-1',
    partId: 'part-1',
    pcId: 'pc-1',
    partName: 'Teclado',
    quantity: 1,
    timestamp: '2026-06-25T12:00:00Z',
    ...overrides,
  } as PartUsage
}

beforeEach(() => {
  localStorage.clear()
})

describe('partUsageService (somente leitura)', () => {
  it('getAll retorna a coleção', () => {
    setCol('part_usage', [usage(), usage({ id: 'u-2' })])
    expect(partUsageService.getAll()).toHaveLength(2)
  })

  it('getByPC filtra por PC ordenando por timestamp desc', () => {
    setCol('part_usage', [
      usage({ id: 'a', timestamp: '2026-06-01T00:00:00Z' }),
      usage({ id: 'b', pcId: 'pc-2' }),
      usage({ id: 'c', timestamp: '2026-07-01T00:00:00Z' }),
    ])
    const usos = partUsageService.getByPC('pc-1')
    expect(usos).toHaveLength(2)
    expect(usos.every((u) => u.pcId === 'pc-1')).toBe(true)
    // Mais recente primeiro.
    expect(usos[0].id).toBe('c')
  })

  it('getByPartId filtra por peça', () => {
    setCol('part_usage', [
      usage({ id: 'a' }),
      usage({ id: 'b', pcId: 'pc-2' }),
      usage({ id: 'c', partId: 'part-9' }),
    ])
    expect(partUsageService.getByPartId('part-1')).toHaveLength(2)
  })

  it('não expõe mais nenhum método de escrita', () => {
    // Trava explícita: se alguém reintroduzir escrita aqui, ela voltaria sem
    // gate de Action, que era exatamente o problema removido.
    expect(Object.keys(partUsageService).sort()).toEqual(['getAll', 'getByPC', 'getByPartId'])
  })
})
