import { beforeEach, describe, expect, it } from 'vitest'
import { campusArtworkKey, readTicketCampus, rememberTicketCampus } from '../campusArtwork'

describe('campus artwork', () => {
  beforeEach(() => sessionStorage.clear())

  it('maps the selected campus and leaves unknown or missing campuses unchanged', () => {
    expect(campusArtworkKey('Anhembi Piracicaba')).toBe('piracicaba')
    expect(campusArtworkKey(' PIRACICABA ')).toBe('piracicaba')
    expect(campusArtworkKey('Anhembi Mooca')).toBeUndefined()
    expect(campusArtworkKey('LabHub — Testes de Notificações')).toBeUndefined()
    expect(campusArtworkKey()).toBeUndefined()
  })

  it('remembers only the artwork for the matching ticket in this tab', () => {
    rememberTicketCampus('ticket-a', 'piracicaba')
    expect(readTicketCampus('ticket-a')).toBe('piracicaba')
    expect(readTicketCampus('ticket-b')).toBeUndefined()
    rememberTicketCampus('ticket-a')
    expect(readTicketCampus('ticket-a')).toBeUndefined()
  })

  it('ignores invalid stored artwork', () => {
    sessionStorage.setItem('labhub:campus-artwork:ticket-a', 'unknown')
    expect(readTicketCampus('ticket-a')).toBeUndefined()
  })
})
