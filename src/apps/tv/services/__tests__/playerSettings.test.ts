import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_KEY,
  loadPlayerSettings,
  savePlayerSettings,
  sanitizePlayerSettings,
} from '../playerSettings'

function seed(settings: unknown) {
  localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(settings))
}

describe('playerSettings — configuração local de volume/mute (Fase 2.8)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults: sem configuração → volume 100, muted false', async () => {
    const settings = await loadPlayerSettings()
    expect(settings).toEqual({ volume: 100, muted: false })
  })

  it('sanitize: entrada vazia/nula → defaults', () => {
    expect(sanitizePlayerSettings(undefined)).toEqual({ volume: 100, muted: false })
    expect(sanitizePlayerSettings(null)).toEqual({ volume: 100, muted: false })
    expect(sanitizePlayerSettings('valor')).toEqual({ volume: 100, muted: false })
    expect(sanitizePlayerSettings({})).toEqual({ volume: 100, muted: false })
  })

  it.each([-1, -10, 101, 500, NaN, Infinity, -Infinity, null, undefined, '50', ''])(
    'sanitize: volume inválido %p → fallback 100',
    (invalid) => {
      expect(sanitizePlayerSettings({ volume: invalid, muted: false }).volume).toBe(100)
    },
  )

  it.each([null, undefined, 'true', 'false', 1, 0, 'sim'])(
    'sanitize: muted inválido %p → fallback false',
    (invalid) => {
      expect(sanitizePlayerSettings({ volume: 40, muted: invalid }).muted).toBe(false)
    },
  )

  it('sanitize: limites 0 e 100 são válidos (volume 0 NÃO vira mudo)', () => {
    const zero = sanitizePlayerSettings({ volume: 0, muted: false })
    expect(zero).toEqual({ volume: 0, muted: false })
    expect(sanitizePlayerSettings({ volume: 100, muted: true })).toEqual({ volume: 100, muted: true })
  })

  it('sanitize: campos parciais válidos preenchem o outro com default', () => {
    expect(sanitizePlayerSettings({ volume: 40 })).toEqual({ volume: 40, muted: false })
    expect(sanitizePlayerSettings({ muted: true })).toEqual({ volume: 100, muted: true })
  })

  it('save: persiste JSON no localStore com chave dedicada', async () => {
    await savePlayerSettings({ volume: 50, muted: true })
    expect(localStorage.getItem(PLAYER_SETTINGS_KEY)).toBe(JSON.stringify({ volume: 50, muted: true }))
  })

  it('load: restaura configuração salva', async () => {
    seed({ volume: 40, muted: true })
    const settings = await loadPlayerSettings()
    expect(settings).toEqual({ volume: 40, muted: true })
  })

  it('load: JSON corrompido → defaults (nunca NaN/string no player)', async () => {
    seed({ volume: -1, muted: 'true' })
    expect(await loadPlayerSettings()).toEqual({ ...DEFAULT_PLAYER_SETTINGS })
    localStorage.setItem(PLAYER_SETTINGS_KEY, 'not-json{{{')
    expect(await loadPlayerSettings()).toEqual({ ...DEFAULT_PLAYER_SETTINGS })
  })

  it('load: round-trip preserva volume/mute', async () => {
    await savePlayerSettings({ volume: 35.5, muted: false })
    expect(await loadPlayerSettings()).toEqual({ volume: 35.5, muted: false })
  })
})