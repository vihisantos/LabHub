import { describe, it, expectTypeOf } from 'vitest'
import type { SyncLogEntry, SyncResult } from '../sync'
import type { RealtimePostgresChangesEvent } from '../useRealtimeSubscription'
import type { useKioskMode } from '../useKioskMode'

type KioskContextValue = ReturnType<typeof useKioskMode>

describe('SyncLogEntry', () => {
  it('tem os campos corretos', () => {
    expectTypeOf<SyncLogEntry>().toHaveProperty('collection')
    expectTypeOf<SyncLogEntry>().toHaveProperty('itemCount')
    expectTypeOf<SyncLogEntry>().toHaveProperty('status')
    expectTypeOf<SyncLogEntry>().toHaveProperty('at')
  })

  it('collection é string', () => {
    expectTypeOf<SyncLogEntry['collection']>().toBeString()
  })

  it('itemCount é number', () => {
    expectTypeOf<SyncLogEntry['itemCount']>().toBeNumber()
  })

  it('status é union de literais', () => {
    expectTypeOf<SyncLogEntry['status']>().toEqualTypeOf<'ok' | 'simulated' | 'error'>()
  })

  it('at é string', () => {
    expectTypeOf<SyncLogEntry['at']>().toBeString()
  })
})

describe('SyncResult', () => {
  it('tem os campos corretos', () => {
    expectTypeOf<SyncResult>().toHaveProperty('synced')
    expectTypeOf<SyncResult>().toHaveProperty('failed')
  })

  it('synced é number', () => {
    expectTypeOf<SyncResult['synced']>().toBeNumber()
  })

  it('failed é array de strings', () => {
    expectTypeOf<SyncResult['failed']>().toEqualTypeOf<string[]>()
  })
})

describe('KioskContextValue', () => {
  it('tem os campos corretos', () => {
    expectTypeOf<KioskContextValue>().toHaveProperty('kioskMode')
    expectTypeOf<KioskContextValue>().toHaveProperty('enterKiosk')
    expectTypeOf<KioskContextValue>().toHaveProperty('exitKiosk')
  })

  it('kioskMode é boolean', () => {
    expectTypeOf<KioskContextValue['kioskMode']>().toBeBoolean()
  })

  it('enterKiosk é função sem argumentos', () => {
    expectTypeOf<KioskContextValue['enterKiosk']>().toBeFunction()
    expectTypeOf<ReturnType<KioskContextValue['enterKiosk']>>().toBeVoid()
  })

  it('exitKiosk é função sem argumentos', () => {
    expectTypeOf<KioskContextValue['exitKiosk']>().toBeFunction()
    expectTypeOf<ReturnType<KioskContextValue['exitKiosk']>>().toBeVoid()
  })
})

describe('RealtimePostgresChangesEvent', () => {
  it('é union de strings literais', () => {
    expectTypeOf<RealtimePostgresChangesEvent>().toEqualTypeOf<'INSERT' | 'UPDATE' | 'DELETE' | '*'>()
  })
})
