import { describe, it, expect, afterEach, vi } from 'vitest'
import { devScreenApp } from '../DesktopApp'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('devScreenApp — tela que o modo dev abre', () => {
  it('sem a variável, cai na TV Ambiente (pasta do Drive é o foco do dev)', () => {
    vi.stubEnv('VITE_DEV_SCREEN_APP', '')
    expect(devScreenApp()).toBe('tv-ambiente')
  })

  it('respeita a escolha explícita de cada tela válida', () => {
    vi.stubEnv('VITE_DEV_SCREEN_APP', 'tv')
    expect(devScreenApp()).toBe('tv')

    vi.stubEnv('VITE_DEV_SCREEN_APP', 'tv-ambiente')
    expect(devScreenApp()).toBe('tv-ambiente')
  })

  it('valor desconhecido cai na TV Ambiente — a TV nunca fica sem tela', () => {
    vi.stubEnv('VITE_DEV_SCREEN_APP', 'painel-secreto')
    expect(devScreenApp()).toBe('tv-ambiente')
  })

  it('tela legada de Chamados não é aceita no modo dev', () => {
    vi.stubEnv('VITE_DEV_SCREEN_APP', 'chamados-dashboard')
    expect(devScreenApp()).toBe('tv-ambiente')
  })

  it('sem .env, respeita a tela já escolhida no dispositivo (sobrevive ao reload)', () => {
    vi.stubEnv('VITE_DEV_SCREEN_APP', '')
    expect(devScreenApp('tv')).toBe('tv')
    expect(devScreenApp('chamados-dashboard')).toBe('tv-ambiente')
  })

  it('o .env tem prioridade sobre a escolha persistida', () => {
    vi.stubEnv('VITE_DEV_SCREEN_APP', 'tv-ambiente')
    expect(devScreenApp('tv')).toBe('tv-ambiente')
  })

  it('sem .env e sem escolha persistida, abre a TV Ambiente', () => {
    vi.stubEnv('VITE_DEV_SCREEN_APP', '')
    expect(devScreenApp(null)).toBe('tv-ambiente')
    expect(devScreenApp(undefined)).toBe('tv-ambiente')
  })
})
