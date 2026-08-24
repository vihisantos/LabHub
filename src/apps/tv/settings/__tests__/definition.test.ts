import { describe, expect, it } from 'vitest'

import {
  TV_REFRESH_MAX,
  TV_REFRESH_MIN,
  clampRefreshInterval,
  tvDefaultSettings,
  validateTvSettings,
} from '../definition'
import type { TvAppSettings } from '../types'

function base(overrides: Partial<TvAppSettings> = {}): unknown {
  return structuredClone({
    ...tvDefaultSettings,
    ...overrides,
    eventSource: { ...tvDefaultSettings.eventSource, ...overrides.eventSource },
    display: { ...tvDefaultSettings.display, ...overrides.display },
    period: { ...tvDefaultSettings.period, ...overrides.period },
  })
}

describe('tvSettingsDefinition', () => {
  describe('defaults', () => {
    it('fonte desligada, sem URL e refresh 300', () => {
      expect(tvDefaultSettings.eventSource.enabled).toBe(false)
      expect(tvDefaultSettings.eventSource.type).toBe('sharepoint_excel')
      expect(tvDefaultSettings.eventSource.url).toBe('')
      expect(tvDefaultSettings.display.refreshIntervalSeconds).toBe(300)
    })

    it('defaults puros passam na validação', () => {
      expect(validateTvSettings(structuredClone(tvDefaultSettings))).toEqual(
        tvDefaultSettings,
      )
    })

    it('enabled=false aceita URL vazia', () => {
      const result = validateTvSettings(base())
      expect(result.eventSource.url).toBe('')
    })
  })

  describe('validação de URL', () => {
    it('enabled=true exige URL', () => {
      const raw = base({ eventSource: { enabled: true } } as Partial<TvAppSettings>)
      expect(() => validateTvSettings(raw)).toThrow('obrigatória')
    })

    it('rejeita HTTP (só HTTPS)', () => {
      const raw = base({
        eventSource: { enabled: true, type: 'sharepoint_excel', url: 'http://x.com/a.xlsx' },
      } as Partial<TvAppSettings>)
      expect(() => validateTvSettings(raw)).toThrow('HTTPS')
    })

    it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///c:/x.xlsx', 'ftp://host/x'])(
      'rejeita protocolo perigoso %s',
      (proto) => {
        const raw = base({
          eventSource: { enabled: true, type: 'sharepoint_excel', url: proto },
        } as Partial<TvAppSettings>)
        expect(() => validateTvSettings(raw)).toThrow()
      },
    )

    it('aceita HTTPS válida quando habilitada', () => {
      const raw = base({
        eventSource: { enabled: true, type: 'sharepoint_excel', url: 'https://a.sharepoint.com/x.xlsx?download=1' },
      } as Partial<TvAppSettings>)
      expect(validateTvSettings(raw).eventSource.url).toContain('.xlsx')
    })

    it('rejeita URL acima de 2048 chars', () => {
      const raw = base({
        eventSource: { enabled: true, type: 'sharepoint_excel', url: `https://a.com/${'x'.repeat(2100)}` },
      } as Partial<TvAppSettings>)
      expect(() => validateTvSettings(raw)).toThrow('tamanho')
    })

    it('rejeita tipo de fonte diferente nesta fase', () => {
      const raw = base()
      ;(raw as { eventSource: { type: string } }).eventSource.type = 'google_sheets'
      expect(() => validateTvSettings(raw)).toThrow('Tipo')
    })
  })

  describe('refreshIntervalSeconds', () => {
    it.each([59, 3601, 300.5])('rejeita %s fora dos limites/não inteiro', (value) => {
      const raw = base({ display: { refreshIntervalSeconds: value } } as Partial<TvAppSettings>)
      expect(() => validateTvSettings(raw)).toThrow('refreshIntervalSeconds')
    })

    it.each([
      [30, TV_REFRESH_MIN],
      [59, TV_REFRESH_MIN],
      [60, 60],
      [301, 301],
      [3600, 3600],
      [99999, TV_REFRESH_MAX],
      [NaN, 300],
      [12.6, TV_REFRESH_MIN],
    ])('clamp(%s) → %s', (input, expected) => {
      expect(clampRefreshInterval(input)).toBe(expected)
    })
  })

  describe('limites de strings/coleções', () => {
    it('rejeita mais de 10 cidades', () => {
      const cities = Array.from({ length: 11 }, (_, i) => `Cidade ${i}`)
      const raw = base({ display: { refreshIntervalSeconds: 300, weatherCities: cities } } as Partial<TvAppSettings>)
      expect(() => validateTvSettings(raw)).toThrow('10')
    })

    it('aceita até 10 cidades e normaliza vazias', () => {
      const cities = ['Piracicaba', '', 'Campinas']
      const result = validateTvSettings(
        base({ display: { refreshIntervalSeconds: 300, weatherCities: cities } } as Partial<TvAppSettings>),
      )
      expect(result.display.weatherCities).toEqual(['Piracicaba', 'Campinas'])
    })

    it('rejeita tickerLabel acima de 200 chars', () => {
      const raw = base({ display: { refreshIntervalSeconds: 300, tickerLabel: 'x'.repeat(201) } } as Partial<TvAppSettings>)
      expect(() => validateTvSettings(raw)).toThrow('Ticker')
    })

    it('rejeita fieldMap com mais de 6 campos', () => {
      const fieldMap = Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [`f${i}`, `col${i}`]),
      )
      const raw = base({ eventSource: { enabled: false, type: 'sharepoint_excel', url: '', fieldMap } } as Partial<TvAppSettings>)
      expect(() => validateTvSettings(raw)).toThrow('fieldMap')
    })

    it('preserva fieldMap válido', () => {
      const raw = base({
        eventSource: { enabled: false, type: 'sharepoint_excel', url: '', fieldMap: { title: 'Evento' } },
      } as Partial<TvAppSettings>)
      expect(validateTvSettings(raw).eventSource.fieldMap).toEqual({ title: 'Evento' })
    })
  })

  describe('estrutura', () => {
    it('rejeita não-objeto', () => {
      expect(() => validateTvSettings(null)).toThrow()
      expect(() => validateTvSettings([1])).toThrow()
    })

    it('rejeita enabled não booleano', () => {
      const raw = base()
      ;(raw as { eventSource: { enabled: string } }).eventSource.enabled = 'sim'
      expect(() => validateTvSettings(raw)).toThrow('booleano')
    })

    it('mantém syncedAt quando presente', () => {
      const result = validateTvSettings(base({ syncedAt: '2026-08-24T15:00:00Z' }))
      expect(result.syncedAt).toBe('2026-08-24T15:00:00Z')
    })
  })
})
