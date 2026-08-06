import { describe, it, expect } from 'vitest'
import { LAUNCHER_MODES, getQuickActions } from '../launcherModes'

describe('launcherModes', () => {
  it('oferece os dois modos', () => {
    expect(LAUNCHER_MODES.map((m) => m.value)).toEqual(['compact', 'dynamic'])
  })

  it('retorna lista vazia para app sem ações rápidas', () => {
    expect(getQuickActions('dashboard')).toEqual([])
  })

  it('retorna ações para apps conhecidos', () => {
    expect(getQuickActions('stock').length).toBeGreaterThan(0)
    expect(getQuickActions('reservalab').length).toBeGreaterThan(0)
    expect(getQuickActions('chamados').length).toBeGreaterThan(0)
  })
})
