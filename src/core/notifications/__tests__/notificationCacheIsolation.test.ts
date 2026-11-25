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
  it('read remains read after eviction, re-entry and account switch', () => {
    setTestUser({ id: 'account-a' })
    const item = { ...row, id: 'periodic:stock:stock-expiry:old' }
    notificationService.ingestRemote(item)
    notificationService.markAsRead(item.id)
    notificationService.reconcilePeriodic(new Set())
    expect(notificationService.getById(item.id)).toBeUndefined()
    expect(notificationService.ingestRemote(item)).toBe(true)
    expect(notificationService.getById(item.id)?.read).toBe(true)
    setTestUser({ id: 'account-b' })
    notificationService.ingestRemote(item)
    expect(notificationService.getById(item.id)?.read).toBe(false)
    setTestUser({ id: 'account-a' })
    expect(notificationService.getById(item.id)?.read).toBe(true)
    notificationService.ingestRemote({ ...item, id: 'periodic:stock:stock-expiry:new' })
    expect(notificationService.getById('periodic:stock:stock-expiry:new')?.read).toBe(false)
  })
  it('mark all persists read markers independently of the latest window', () => {
    setTestUser({ id: 'account-a' })
    const item = { ...row, id: 'periodic:stock:stock-expiry:bulk' }
    notificationService.ingestRemote(item)
    notificationService.markAllAsRead()
    notificationService.reconcilePeriodic(new Set())
    notificationService.ingestRemote(item)
    expect(notificationService.getById(item.id)?.read).toBe(true)
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
