import { pcToRows, partToRows } from '../export'
import type { PC, Part } from '../../types'

const mockPC: PC = {
  id: 'pc-1',
  labName: 'Lab A',
  pcNumber: 'PC-001',
  assetTag: 'TAG-001',
  roomLocation: 'Sala 101',
  specs: { cpu: 'i5', ram: '8GB', storage: '256GB' },
  config: { osType: 'windows11', osVersion: '24H2', osEdition: 'enterprise', pcType: 'academico', domain: 'animaedu.intranet' },
  cleaningStatus: 'done',
  restorationStatus: 'in_progress',
  softwareInstalled: ['Chrome', 'VS Code'],
  partsReplaced: [{ partId: 'p1', partName: 'Teclado', category: 'periferico', quantity: 1, replacedAt: { seconds: 1000, nanoseconds: 0 } as any }],
  observations: 'Observação',
  photos: [],
  lastIntervention: { seconds: 2000, nanoseconds: 0 } as any,
  createdAt: { seconds: 1000, nanoseconds: 0 } as any,
  updatedAt: { seconds: 1000, nanoseconds: 0 } as any,
}

const mockPart: Part = {
  id: 'part-1',
  name: 'Teclado',
  category: 'periferico',
  quantity: 10,
  minQuantity: 2,
  serialNumber: 'SN-001',
  notes: 'Nota',
  createdAt: { seconds: 1000, nanoseconds: 0 } as any,
  updatedAt: { seconds: 1000, nanoseconds: 0 } as any,
}

describe('pcToRows', () => {
  it('retorna headers corretos', () => {
    const { headers } = pcToRows([mockPC])
    expect(headers).toEqual([
      'Laboratório', 'PC', 'Localização', 'CPU', 'RAM',
      'Armazenamento', 'Sistema Operacional', 'Versão', 'Edição',
      'Tipo', 'Domínio', 'Limpeza', 'Restauração',
      'Softwares', 'Peças Trocadas', 'Observações',
    ])
  })

  it('converte PC em linha corretamente', () => {
    const { rows } = pcToRows([mockPC])
    expect(rows[0]).toEqual([
      'Lab A',
      'PC-001',
      'Sala 101',
      'i5',
      '8GB',
      '256GB',
      'Windows 11',
      '24H2',
      'Enterprise',
      'Acadêmico',
      'animaedu.intranet',
      'Concluído',
      'Em andamento',
      'Chrome; VS Code',
      'Teclado (1x)',
      'Observação',
    ])
  })

  it('lida com lista vazia', () => {
    const { rows } = pcToRows([])
    expect(rows).toHaveLength(0)
  })
})

describe('partToRows', () => {
  it('retorna headers corretos', () => {
    const { headers } = partToRows([mockPart])
    expect(headers).toEqual(['Nome', 'Categoria', 'Quantidade', 'Qtd. Mínima', 'N Série', 'Observações'])
  })

  it('converte Part em linha corretamente', () => {
    const { rows } = partToRows([mockPart])
    expect(rows[0]).toEqual(['Teclado', 'periferico', '10', '2', 'SN-001', 'Nota'])
  })

  it('usa string vazia para optional fields ausentes', () => {
    const part: Part = { ...mockPart, serialNumber: undefined, notes: undefined }
    const { rows } = partToRows([part])
    expect(rows[0][4]).toBe('')
    expect(rows[0][5]).toBe('')
  })

  it('lida com lista vazia', () => {
    const { rows } = partToRows([])
    expect(rows).toHaveLength(0)
  })
})
