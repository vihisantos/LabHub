import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isKiosk, kioskError, resetKioskErrorCount } from '../kiosk'

describe('kiosk', () => {
  beforeEach(() => {
    resetKioskErrorCount()
    delete (window as unknown as { desktop?: unknown }).desktop
  })

  it('isKiosk false no navegador', () => {
    expect(isKiosk()).toBe(false)
  })

  it('isKiosk true com desktop', () => {
    (window as unknown as { desktop: { isDesktop: boolean } }).desktop = { isDesktop: true }
    expect(isKiosk()).toBe(true)
  })

  it('kioskError retorna false e não loga no web', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(kioskError('x')).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('kioskError loga e conta em kiosk', () => {
    (window as unknown as { desktop: { isDesktop: boolean } }).desktop = { isDesktop: true }
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(kioskError('boom')).toBe(true)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})