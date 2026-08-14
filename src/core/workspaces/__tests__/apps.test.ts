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
  disabled_apps: ['tv', 'stock'],
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
}

describe('APPS_CONFIGURABLE', () => {
  it('exclui admin e dashboard (sempre ligados)', () => {
    expect(APPS_CONFIGURABLE).not.toContain('admin')
    expect(APPS_CONFIGURABLE).not.toContain('dashboard')
  })

  it('inclui os apps que podem ser desativados por workspace', () => {
    for (const id of ['pc-care', 'stock', 'reservalab', 'tv', 'chamados']) {
      expect(APPS_CONFIGURABLE).toContain(id)
    }
  })
})

describe('isAppDisabled', () => {
  it('retorna false sem workspace', () => {
    expect(isAppDisabled('tv', null)).toBe(false)
    expect(isAppDisabled('tv', undefined)).toBe(false)
  })

  it('retorna true quando o app está em disabled_apps', () => {
    expect(isAppDisabled('tv', ws)).toBe(true)
    expect(isAppDisabled('stock', ws)).toBe(true)
  })

  it('retorna false quando o app não está desativado', () => {
    expect(isAppDisabled('reservalab', ws)).toBe(false)
    expect(isAppDisabled('chamados', ws)).toBe(false)
  })

  it('funciona com disabled_apps ausente', () => {
    const clean: Workspace = { ...ws, disabled_apps: undefined }
    expect(isAppDisabled('tv', clean)).toBe(false)
  })
})

describe('filterAppsByWorkspace', () => {
  const apps = [
    { id: 'pc-care' },
    { id: 'stock' },
    { id: 'reservalab' },
    { id: 'tv' },
    { id: 'chamados' },
  ]

  it('remove os apps desativados do workspace', () => {
    const result = filterAppsByWorkspace(apps, ws)
    expect(result.map((a) => a.id)).toEqual(['pc-care', 'reservalab', 'chamados'])
  })

  it('retorna tudo quando não há workspace', () => {
    expect(filterAppsByWorkspace(apps, null)).toHaveLength(apps.length)
    expect(filterAppsByWorkspace(apps, undefined)).toHaveLength(apps.length)
  })
})
