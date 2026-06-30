import { describe, it, expect } from 'vitest'
import { normalizeLabName, getLabDisplayName } from '../labUtils'

describe('normalizeLabName', () => {
  it('normaliza "Lab 01" para LAB01', () => {
    expect(normalizeLabName('Lab 01')).toBe('LAB01')
  })

  it('normaliza "lab1" para LAB01', () => {
    expect(normalizeLabName('lab1')).toBe('LAB01')
  })

  it('normaliza "Lab 02" para LAB02', () => {
    expect(normalizeLabName('Lab 02')).toBe('LAB02')
  })

  it('normaliza "LAB02" para LAB02', () => {
    expect(normalizeLabName('LAB02')).toBe('LAB02')
  })

  it('normaliza "lab 1" para LAB01', () => {
    expect(normalizeLabName('lab 1')).toBe('LAB01')
  })

  it('normaliza "lab0 1" para LAB01', () => {
    expect(normalizeLabName('lab0 1')).toBe('LAB01')
  })

  it('retorna null para nomes que não correspondem a laboratórios conhecidos', () => {
    expect(normalizeLabName('Sala 101')).toBeNull()
    expect(normalizeLabName('Auditório')).toBeNull()
    expect(normalizeLabName('Lab 03')).toBeNull()
  })

  it('retorna null para null', () => {
    expect(normalizeLabName(null)).toBeNull()
  })

  it('retorna null para undefined', () => {
    expect(normalizeLabName(undefined)).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(normalizeLabName('')).toBeNull()
  })

  it('remove espaços extras antes de normalizar', () => {
    expect(normalizeLabName('  Lab  01  ')).toBe('LAB01')
  })
})

describe('getLabDisplayName', () => {
  it('retorna "Lab 01" para LAB01', () => {
    expect(getLabDisplayName('LAB01')).toBe('Lab 01')
  })

  it('retorna "Lab 02" para LAB02', () => {
    expect(getLabDisplayName('LAB02')).toBe('Lab 02')
  })

  it('retorna "Lab 01" para "lab1"', () => {
    expect(getLabDisplayName('lab1')).toBe('Lab 01')
  })

  it('retorna "Lab 01" para "Lab 01"', () => {
    expect(getLabDisplayName('Lab 01')).toBe('Lab 01')
  })

  it('retorna string original para nomes não mapeados', () => {
    expect(getLabDisplayName('Sala 101')).toBe('Sala 101')
    expect(getLabDisplayName('Lab 03')).toBe('Lab 03')
  })

  it('retorna string vazia para null', () => {
    expect(getLabDisplayName(null)).toBe('')
  })

  it('retorna string vazia para undefined', () => {
    expect(getLabDisplayName(undefined)).toBe('')
  })

  it('remove espaços extras antes de retornar display', () => {
    expect(getLabDisplayName('  lab1  ')).toBe('Lab 01')
  })
})
