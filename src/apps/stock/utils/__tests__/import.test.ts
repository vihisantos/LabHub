import { mapStockRow, validateRows } from '../import'

const HEADERS = [
  'Nome', 'Seção', 'Subcategoria', 'Nº Série', 'Sala',
  'Status', 'Condição', 'Tipo Cabo', 'Comprimento', 'Conectores',
  'Tomadas', 'Observações',
]

describe('mapStockRow', () => {
  it('mapeia linha completa com todos os campos', () => {
    const row = [
      'Mouse Logitech M90',
      'Periféricos',
      'Mouse',
      'SN-001',
      'Lab Info 1',
      'Ativo',
      'Bom',
      '',
      '',
      '',
      '',
      'Mouse novo',
    ]
    const result = mapStockRow(HEADERS, row)
    expect(result.name).toBe('Mouse Logitech M90')
    expect(result.section).toBe('perifericos')
    expect(result.subcategory).toBe('Mouse')
    expect(result.serialNumber).toBe('SN-001')
    expect(result.room).toBe('Lab Info 1')
    expect(result.status).toBe('ativo')
    expect(result.condition).toBe('Bom')
    expect(result.notes).toBe('Mouse novo')
    expect(result.linkedPcId).toBeUndefined()
    expect(result.linkedPcLabel).toBeUndefined()
  })

  it('mapeia seção pelo label em português', () => {
    const cases: [string, string][] = [
      ['Máquinas', 'maquinas'],
      ['Periféricos', 'perifericos'],
      ['Material de Escritório', 'material_escritorio'],
      ['Adaptadores', 'adaptadores'],
      ['Equipamentos', 'equipamentos'],
      ['Cabos', 'cabos'],
      ['Outros', 'outros'],
    ]
    for (const [label, expected] of cases) {
      const result = mapStockRow(['Nome', 'Seção'], ['Item', label])
      expect(result.section).toBe(expected)
    }
  })

  it('usa "outros" para seção desconhecida', () => {
    const result = mapStockRow(['Nome', 'Seção'], ['Item', 'Inexistente'])
    expect(result.section).toBe('outros')
  })

  it('usa "outros" quando seção está vazia', () => {
    const result = mapStockRow(['Nome', 'Seção'], ['Item', ''])
    expect(result.section).toBe('outros')
  })

  it('mapeia status pelo label em português', () => {
    const cases: [string, string][] = [
      ['Ativo', 'ativo'],
      ['Em Conserto', 'em_conserto'],
      ['Emprestado', 'emprestado'],
      ['Descartado', 'descartado'],
    ]
    for (const [label, expected] of cases) {
      const result = mapStockRow(['Nome', 'Status'], ['Item', label])
      expect(result.status).toBe(expected)
    }
  })

  it('usa "ativo" para status desconhecido ou vazio', () => {
    const r1 = mapStockRow(['Nome', 'Status'], ['Item', 'Invalido'])
    expect(r1.status).toBe('ativo')
    const r2 = mapStockRow(['Nome', 'Status'], ['Item', ''])
    expect(r2.status).toBe('ativo')
  })

  it('retorna string vazia para nome ausente', () => {
    const result = mapStockRow(['Nome', 'Seção'], ['', 'Máquinas'])
    expect(result.name).toBe('')
  })

  it('mapeia campos opcionais de cabo', () => {
    const row = ['Cabo HDMI', 'Cabos', 'Cabo HDMI', '', 'Lab Redes', 'Ativo', 'Bom', 'HDMI', '3', 'Macho/Macho', '1', 'Cabo novo']
    const result = mapStockRow(HEADERS, row)
    expect(result.cableType).toBe('HDMI')
    expect(result.cableLength).toBe('3')
    expect(result.connectorType).toBe('Macho/Macho')
    expect(result.outletCount).toBe(1)
  })

  it('deixa undefined campos opcionais de cabo quando vazios', () => {
    const row = ['Cabo HDMI', 'Cabos', 'Cabo HDMI', '', '', 'Ativo', 'Bom', '', '', '', '', '']
    const result = mapStockRow(HEADERS, row)
    expect(result.cableType).toBeUndefined()
    expect(result.cableLength).toBeUndefined()
    expect(result.connectorType).toBeUndefined()
    expect(result.outletCount).toBeUndefined()
  })

  it('usa "Bom" como condição padrão quando vazia', () => {
    const result = mapStockRow(['Nome', 'Condição'], ['Item', ''])
    expect(result.condition).toBe('Bom')
  })

  it('lida com linhas com menos colunas que headers', () => {
    const row = ['Item']
    const result = mapStockRow(['Nome', 'Seção', 'Status'], row)
    expect(result.name).toBe('Item')
    expect(result.section).toBe('outros')
    expect(result.status).toBe('ativo')
  })

  it('retorna dados válidos para StockItemFormData', () => {
    const row = ['Notebook Dell', 'Máquinas', 'Notebook', 'SN-001', 'Sala 202', 'Ativo', 'Bom', '', '', '', '', '']
    const result = mapStockRow(HEADERS, row)
    // Verifica que todos os campos obrigatórios estão presentes
    const keys: (keyof typeof result)[] = [
      'name', 'section', 'subcategory', 'serialNumber', 'room',
      'status', 'condition', 'notes',
    ]
    for (const key of keys) {
      expect(result).toHaveProperty(key)
    }
  })
})

describe('validateRows', () => {
  it('retorna null quando todas as linhas têm colunas suficientes', () => {
    const rows = [
      ['Nome', 'Seção', 'Status'],
      ['Item A', 'Máquinas', 'Ativo'],
      ['Item B', 'Periféricos', 'Emprestado'],
    ]
    expect(validateRows(rows, 2)).toBeNull()
  })

  it('retorna mensagem de erro quando linha tem colunas insuficientes', () => {
    const rows = [
      ['Item A', 'Máquinas', 'Ativo'],  // linha ok (3 cols)
      ['Item B', 'Periféricos', 'Emprestado'],  // linha ok (3 cols)
      ['Item'],  // apenas 1 coluna, esperado 3 → linha 4 (i=2, i+2=4)
    ]
    const err = validateRows(rows, 3)
    expect(err).toBe('Linha 4: número insuficiente de colunas (1, esperado 3)')
  })

  it('retorna erro na primeira linha inválida', () => {
    const rows = [
      ['A', 'B'],
      ['C'],      // 1 coluna, esperado 2 → inválida
      ['D', 'E'],
      ['F'],      // inválida também, mas deve parar na primeira
    ]
    const err = validateRows(rows, 2)
    expect(err).toBe('Linha 3: número insuficiente de colunas (1, esperado 2)')
  })

  it('lida com array vazio', () => {
    expect(validateRows([], 1)).toBeNull()
  })

  it('considera colunas exatas como suficiente', () => {
    const rows = [['A', 'B', 'C']]
    expect(validateRows(rows, 3)).toBeNull()
  })

  it('considera mais colunas que o mínimo como suficiente', () => {
    const rows = [['A', 'B', 'C', 'D', 'E']]
    expect(validateRows(rows, 2)).toBeNull()
  })
})
