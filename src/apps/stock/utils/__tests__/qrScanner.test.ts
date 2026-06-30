import { parseQrCode, findStockItemByQrCode } from '../qrScanner'
import type { StockItem, StockSection, StockItemStatus } from '../../types'

const makeItem = (overrides: Partial<StockItem> = {}): StockItem => ({
  id: crypto.randomUUID(),
  name: 'Notebook Dell',
  section: 'maquinas' as StockSection,
  subcategory: 'Notebook',
  serialNumber: 'SN-001',
  room: 'Sala 101',
  status: 'ativo' as StockItemStatus,
  condition: 'Bom',
  notes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const items: StockItem[] = [
  makeItem({ id: '1', name: 'Notebook Dell', section: 'maquinas' }),
  makeItem({ id: '2', name: 'Mouse Logitech', section: 'perifericos' }),
  makeItem({ id: '3', name: 'Teclado Mecânico', section: 'perifericos' }),
  makeItem({ id: '4', name: 'Cabo HDMI 3m', section: 'cabos' }),
  makeItem({ id: '5', name: 'SSD Kingston', section: 'equipamentos' }),
]

describe('parseQrCode', () => {
  it('extrai section e name de código com "/"', () => {
    const result = parseQrCode('maquinas/Notebook Dell')
    expect(result.section).toBe('maquinas')
    expect(result.name).toBe('Notebook Dell')
  })

  it('trata espaços extras ao redor do código', () => {
    const result = parseQrCode('  perifericos / Mouse Logitech  ')
    expect(result.section).toBe('perifericos')
    expect(result.name).toBe('Mouse Logitech')
  })

  it('usa string vazia para section quando não há "/"', () => {
    const result = parseQrCode('Notebook Dell')
    expect(result.section).toBe('')
    expect(result.name).toBe('Notebook Dell')
  })

  it('usa string vazia para ambos quando código é vazio', () => {
    const result = parseQrCode('')
    expect(result.section).toBe('')
    expect(result.name).toBe('')
  })

  it('usa section vazia e name com "/" no final', () => {
    const result = parseQrCode('apenasnome/')
    expect(result.section).toBe('apenasnome')
    expect(result.name).toBe('')
  })

  it('usa section vazia e name com "/" no início', () => {
    const result = parseQrCode('/apenasnome')
    expect(result.section).toBe('')
    expect(result.name).toBe('apenasnome')
  })
})

describe('findStockItemByQrCode', () => {
  it('encontra item por section + nome exato', () => {
    const result = findStockItemByQrCode(items, 'maquinas/Notebook Dell')
    expect(result).toBeDefined()
    expect(result!.id).toBe('1')
    expect(result!.name).toBe('Notebook Dell')
  })

  it('encontra item com case insensitive', () => {
    const result = findStockItemByQrCode(items, 'MAQUINAS/NOTEBOOK DELL')
    expect(result).toBeDefined()
    expect(result!.id).toBe('1')
  })

  it('encontra item por nome apenas (sem section)', () => {
    const result = findStockItemByQrCode(items, 'Mouse Logitech')
    expect(result).toBeDefined()
    expect(result!.id).toBe('2')
  })

  it('retorna undefined quando section não corresponde', () => {
    const result = findStockItemByQrCode(items, 'perifericos/Notebook Dell')
    expect(result).toBeUndefined()
  })

  it('retorna undefined quando nome não corresponde', () => {
    const result = findStockItemByQrCode(items, 'maquinas/Item Inexistente')
    expect(result).toBeUndefined()
  })

  it('retorna undefined quando código é vazio', () => {
    const result = findStockItemByQrCode(items, '')
    expect(result).toBeUndefined()
  })

  it('retorna undefined quando lista de itens está vazia', () => {
    const result = findStockItemByQrCode([], 'maquinas/Notebook Dell')
    expect(result).toBeUndefined()
  })

  it('encontra primeiro item quando há múltiplos com mesmo nome na mesma seção', () => {
    const itemsComDuplicata = [
      ...items,
      makeItem({ id: '6', name: 'Notebook Dell', section: 'maquinas' }),
    ]
    const result = findStockItemByQrCode(itemsComDuplicata, 'maquinas/Notebook Dell')
    expect(result).toBeDefined()
    expect(result!.id).toBe('1') // Retorna o primeiro encontrado
  })
})
