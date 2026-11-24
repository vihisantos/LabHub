import { describe, it, expect } from 'vitest'
import { setTestUser } from '../../../test/mocks'
import { getCol, setCol } from '../../../lib/db'
import { notificationService, appNotificationFromRow } from '../service'

describe('personal notification cache', () => {
  const row = appNotificationFromRow({ id: 'private-a', title: 'Private A', body: 'private', type: 'system' })
  it('never adopts legacy rows or another account cache, including offline', () => {
    setCol('notifications', [row])
    setTestUser({ id: 'account-a' })
    expect(notificationService.getAll()).toEqual([])
    expect(notificationService.ingestRemote(row)).toBe(true)
    notificationService.markAsRead(row.id)
    expect(notificationService.getById(row.id)?.read).toBe(true)
    setTestUser({ id: 'account-b' })
    expect(notificationService.getAll()).toEqual([])
    expect(notificationService.getAllAcrossWorkspaces()).toEqual([])
    expect(notificationService.remove(row.id)).toBe(false)
    expect(notificationService.ingestRemote({ ...row, id: 'private-b' })).toBe(true)
    setTestUser(null)
    expect(notificationService.getAll()).toEqual([])
    expect(notificationService.ingestRemote(row)).toBe(false)
    setTestUser({ id: 'account-a' })
    expect(notificationService.getAll().map(n => n.id)).toEqual(['private-a'])
    expect(getCol('notifications')).toEqual([row])
  })
  it('reconciles only periodic rows after a successful authorized server window', () => {
    setTestUser({ id: 'account-a' })
    notificationService.ingestRemote(row)
    const keep = { ...row, id: 'periodic:stock:stock-expiry:keep' }
    const revoked = { ...row, id: 'periodic:stock:stock-expiry:revoked' }
    notificationService.ingestRemote(keep)
    notificationService.ingestRemote(revoked)
    notificationService.markAsRead(keep.id)
    expect(notificationService.reconcilePeriodic(new Set([keep.id]))).toBe(true)
    expect(notificationService.getById(revoked.id)).toBeUndefined()
    expect(notificationService.getById(keep.id)?.read).toBe(true)
    expect(notificationService.getById(row.id)).toBeDefined()
    expect(notificationService.ingestRemote(revoked)).toBe(true)
  })
  it('dismissal survives repeated server fetches without affecting another account', () => {
    setTestUser({ id: 'account-a' })
    notificationService.ingestRemote(row)
    expect(notificationService.remove(row.id)).toBe(true)
    expect(notificationService.ingestRemote(row)).toBe(false)
    setTestUser({ id: 'account-b' })
    expect(notificationService.ingestRemote(row)).toBe(true)
  })
})
