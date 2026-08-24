import { describe, expect, it } from 'vitest'
import { appRegistry, plannedApps, type AppModule } from '../appRegistry'
import { APPS_CONFIGURABLE } from '../core/workspaces/apps'

const REQUIRED_KEYS: Array<keyof AppModule> = ['id', 'name', 'description', 'icon', 'route', 'color']

describe('appRegistry (compatibilidade com apps antigos)', () => {
  it('mantém os apps originais registrados', () => {
    const ids = appRegistry.map((a) => a.id)
    expect(ids).toContain('dashboard')
    expect(ids).toContain('pc-care')
    expect(ids).toContain('stock')
    expect(ids).toContain('reservalab')
    expect(ids).toContain('tv')
    expect(ids).toContain('chamados')
    expect(ids).toContain('admin')
  })

  it('ids são únicos', () => {
    const ids = appRegistry.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todo app cumpre o contrato base (campos obrigatórios)', () => {
    for (const app of [...appRegistry, ...plannedApps]) {
      for (const key of REQUIRED_KEYS) {
        expect(app[key]).toBeDefined()
      }
    }
  })

  it('capacidades opcionais ausentes não quebram apps existentes', () => {
    const dashboard = appRegistry.find((a) => a.id === 'dashboard')!
    expect(dashboard.configurable).toBeUndefined()
    expect(dashboard.clearable).toBeUndefined()
    expect(dashboard.settings).toBeUndefined()
    expect(dashboard.SettingsPanel).toBeUndefined()
  })

  it('tv declara as capacidades esperadas (configurable + clearable), sem painel ainda', () => {
    const tv = appRegistry.find((a) => a.id === 'tv')!
    expect(tv.configurable).toBe(true)
    expect(tv.clearable).toBe(true)
    expect(tv.settings).toBeUndefined() // TvSettingsDefinition chega no PR da integração
    expect(tv.SettingsPanel).toBeUndefined() // TvSettingsPanel idem
  })

  it('APPS_CONFIGURABLE exclui admin/dashboard e inclui tv', () => {
    expect(APPS_CONFIGURABLE).not.toContain('admin')
    expect(APPS_CONFIGURABLE).not.toContain('dashboard')
    expect(APPS_CONFIGURABLE).toContain('tv')
  })
})

describe('plannedApps (Painel de Chamados preparado)', () => {
  it('declara o módulo com capacidades esperadas, fora do launcher por enquanto', () => {
    const dash = plannedApps.find((a) => a.id === 'chamados-dashboard')!
    expect(dash.name).toBe('Painel de Chamados')
    expect(dash.description).toBe('Dashboard de chamados e indicadores para telas da TI.')
    expect(dash.configurable).toBe(true)
    expect(dash.clearable).toBe(false)
    // Ainda não pode aparecer no launcher: não existe página/route real.
    expect(appRegistry.find((a) => a.id === 'chamados-dashboard')).toBeUndefined()
  })

  it('nenhum id planejado colide com o registro atual (promoção futura é um splice)', () => {
    const current = new Set(appRegistry.map((a) => a.id))
    for (const app of plannedApps) {
      expect(current.has(app.id)).toBe(false)
    }
  })
})
