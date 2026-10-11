import { describe, it, expect } from 'vitest'
import { PatrimonioError, toPatrimonioError, validationError } from '../errors'
import { toAsset, toLocation, toMovement, toResponsible } from '../mappers'
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  isAssetCondition,
  isAssetMovementType,
  isAssetStatus,
  isRegistrableMovementType,
} from '../types'

describe('enums espelham o schema real (091–096)', () => {
  it('condições e status são exatamente os do CHECK', () => {
    expect(ASSET_CONDITIONS).toEqual(['novo', 'bom', 'regular', 'danificado', 'inservivel'])
    expect(ASSET_STATUSES).toEqual([
      'draft',
      'disponivel',
      'em_uso',
      'emprestado',
      'manutencao',
      'em_transito',
      'nao_localizado',
      'baixado',
    ])
  })

  it('guards rejeitam valores fora do CHECK', () => {
    expect(isAssetStatus('disponivel')).toBe(true)
    expect(isAssetStatus('active')).toBe(false) // valor do modelo legado removido
    expect(isAssetCondition('danificado')).toBe(true)
    expect(isAssetCondition('quebrado')).toBe(false)
    expect(isAssetMovementType('emprestimo')).toBe(true)
    expect(isAssetMovementType('mensagem')).toBe(false)
    expect(isRegistrableMovementType('criacao')).toBe(false) // não é registrável pelo cliente
    expect(isRegistrableMovementType('transferencia')).toBe(true)
  })
})

describe('mappers — desconhecido → tipo, sem cast de any', () => {
  it('toAsset preserva condition e responsible_id e protege contra status inválido', () => {
    const asset = toAsset({
      id: 'a-1',
      workspace_id: 'ws-1',
      name: 'PC',
      status: 'nao_localizado',
      condition: 'danificado',
      responsible_id: 'r-1',
      metadata: { k: 'v' },
    })
    expect(asset.status).toBe('nao_localizado')
    expect(asset.condition).toBe('danificado')
    expect(asset.responsible_id).toBe('r-1')
    expect(asset.metadata).toEqual({ k: 'v' })

    const drifted = toAsset({ id: 'a-2', status: 'active', condition: 'reiniciado' })
    expect(drifted.status).toBe('draft')
    expect(drifted.condition).toBe('bom')
  })

  it('toMovement traduz fontes desconhecidas para ui e normaliza ausências', () => {
    const mv = toMovement({ id: 'mv-1', type: 'transferencia', source: 'xpto' })
    expect(mv.type).toBe('transferencia')
    expect(mv.source).toBe('ui')
    expect(mv.to_location_id).toBeNull()
    expect(mv.note).toBe('')
  })

  it('toLocation/toResponsible aplicam defaults vazios', () => {
    expect(toLocation({ nome: 'Sala' })).toMatchObject({ nome: 'Sala', predio: '', andar: '' })
    expect(toResponsible({ nome: 'Fulano' })).toMatchObject({
      nome: 'Fulano',
      matricula: null,
      email: null,
      profile_id: null,
    })
  })
})

describe('toPatrimonioError — tradução de códigos do Postgres', () => {
  const cases: Array<[string, string]> = [
    ['42501', 'permission_denied'],
    ['23505', 'conflict'],
    ['23503', 'invalid_reference'],
    ['23514', 'invalid_value'],
    ['PGRST116', 'not_found'],
    ['XX999', 'query_failed'],
  ]

  it.each(cases)('código %s ⇒ %s', (code, expected) => {
    const err = toPatrimonioError({ code, message: 'raw db detail' })
    expect(err).toBeInstanceOf(PatrimonioError)
    expect(err.code).toBe(expected)
    // mensagem segura NÃO é o texto bruto do banco
    expect(err.message).not.toContain('raw db detail')
    // o detalhe bruto fica só no diagnóstico
    expect(err.diagnostic).toContain('raw db detail')
  })

  it('preserva um PatrimonioError já normalizado', () => {
    const original = validationError('campo X')
    expect(toPatrimonioError(original)).toBe(original)
  })

  it('validationError é marcado como validação', () => {
    const err = validationError('obrigatório')
    expect(err.code).toBe('validation')
    expect(err.message).toBe('obrigatório')
  })
})
