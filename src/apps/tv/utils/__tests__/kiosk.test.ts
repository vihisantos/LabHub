import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isKiosk, kioskError, resetKioskErrorCount } from '../kiosk'

/* A detecção usa a API oficial `isTauri()`. No navegador ela é false; no
 * desktop é true. Não existe mais bridge `window.desktop` para simular. */
const state = vi.hoisted(() => ({ tauri: false }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => state.tauri }))

describe('kiosk', () => {
  beforeEach(() => {
    resetKioskErrorCount()
    state.tauri = false
  })

  it('isKiosk false no navegador', () => {
    expect(isKiosk()).toBe(false)
  })

  it('isKiosk true no desktop Tauri', () => {
    state.tauri = true
    expect(isKiosk()).toBe(true)
  })

  it('kioskError retorna false e não loga no web', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(kioskError('x')).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('kioskError loga e conta no desktop', () => {
    state.tauri = true
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(kioskError('boom')).toBe(true)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
