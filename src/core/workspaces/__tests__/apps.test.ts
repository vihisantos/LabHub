import { describe, it, expect } from 'vitest'
import { APPS_CONFIGURABLE, isAppDisabled, filterAppsByWorkspace } from '../apps'
import type { Workspace } from '../types'

const ws: Workspace = {
  id: 'ws-1',
  name: 'Escola A',
  slug: 'escola-a',
  location: 'Piracicaba, SP',
  spreadsheet_url: '',
  color: '#22c55e',
  disabled_apps: ['reservalab', 'stock'],
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
}

describe('APPS_CONFIGURABLE', () => {
  it('exclui admin e dashboard (sempre ligados)', () => {
    expect(APPS_CONFIGURABLE).not.toContain('admin')
    expect(APPS_CONFIGURABLE).not.toContain('dashboard')
  })

  it('inclui os apps que podem ser desativados por workspace', () => {
    for (const id of ['pc-care', 'stock', 'reservalab', 'chamados']) {
      expect(APPS_CONFIGURABLE).toContain(id)
    }
  })

  it('não inclui TV (módulo descontinuado no PWA)', () => {
    expect(APPS_CONFIGURABLE).not.toContain('tv')
  })
})

describe('isAppDisabled', () => {
  it('retorna false sem workspace', () => {
    expect(isAppDisabled('pc-care', null)).toBe(false)
    expect(isAppDisabled('pc-care', undefined)).toBe(false)
  })

  it('retorna true quando o app está em disabled_apps', () => {
    expect(isAppDisabled('reservalab', ws)).toBe(true)
    expect(isAppDisabled('stock', ws)).toBe(true)
  })

  it('retorna false quando o app não está desativado', () => {
    expect(isAppDisabled('pc-care', ws)).toBe(false)
    expect(isAppDisabled('chamados', ws)).toBe(false)
  })

  it('funciona com disabled_apps ausente', () => {
    const clean: Workspace = { ...ws, disabled_apps: undefined }
    expect(isAppDisabled('pc-care', clean)).toBe(false)
  })
})

describe('filterAppsByWorkspace', () => {
  const apps = [
    { id: 'pc-care' },
    { id: 'stock' },
    { id: 'reservalab' },
    { id: 'chamados' },
  ]

  it('remove os apps desativados do workspace', () => {
    const result = filterAppsByWorkspace(apps, ws)
    expect(result.map((a) => a.id)).toEqual(['pc-care', 'chamados'])
  })

  it('retorna tudo quando não há workspace', () => {
    expect(filterAppsByWorkspace(apps, null)).toHaveLength(apps.length)
    expect(filterAppsByWorkspace(apps, undefined)).toHaveLength(apps.length)
  })
})

// F2-D-N2: `isModuleAvailable` foi removida de `../apps` — existia só para
// combinar `disabled_apps` com o getter legado `canAccessApp`. A combinação dos
// dois eixos agora acontece em `useModuleVisibility`, e por isso não há mais
// função equivalente para testar aqui.
