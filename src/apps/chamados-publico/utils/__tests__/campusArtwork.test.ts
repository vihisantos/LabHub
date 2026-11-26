import { beforeEach, describe, expect, it } from 'vitest'
import { campusArtworkKey, readTicketCampus, rememberTicketCampus } from '../campusArtwork'

describe('campus artwork', () => {
  beforeEach(() => sessionStorage.clear())

  it.each([
    ['Anhembi Piracicaba', 'piracicaba'],
    [' PIRACICABA ', 'piracicaba'],
    ['Anhembi Mooca', 'mooca'],
    ['Anhembi São José', 'sjc'],
    ['Anhembi São José dos Campos', 'sjc'],
    ['SJC', 'sjc'],
  ] as const)('maps %s to %s', (name, key) => {
    expect(campusArtworkKey(name)).toBe(key)
  })

  it('leaves unknown or missing campuses unchanged', () => {
    expect(campusArtworkKey('LabHub — Testes de Notificações')).toBeUndefined()
    expect(campusArtworkKey()).toBeUndefined()
  })

  it('remembers only the artwork for the matching ticket in this tab', () => {
    rememberTicketCampus('ticket-a', 'piracicaba')
    rememberTicketCampus('ticket-b', 'mooca')
    rememberTicketCampus('ticket-c', 'sjc')
    expect(readTicketCampus('ticket-a')).toBe('piracicaba')
    expect(readTicketCampus('ticket-b')).toBe('mooca')
    expect(readTicketCampus('ticket-c')).toBe('sjc')
    expect(readTicketCampus('ticket-d')).toBeUndefined()
    rememberTicketCampus('ticket-a')
    expect(readTicketCampus('ticket-a')).toBeUndefined()
  })

  it('ignores invalid stored artwork', () => {
    sessionStorage.setItem('labhub:campus-artwork:ticket-a', 'unknown')
    expect(readTicketCampus('ticket-a')).toBeUndefined()
  })
})
