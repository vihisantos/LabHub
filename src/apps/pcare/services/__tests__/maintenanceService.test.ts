import { maintenanceService } from '../maintenanceService'
import type { MaintenanceFormData } from '../../types/maintenance'

function validFormData(overrides?: Partial<MaintenanceFormData>): MaintenanceFormData {
  return {
    pcId: 'pc-1',
    labName: 'Lab A',
    pcNumber: 'PC-001',
    type: 'cleaning',
    scheduledDate: { seconds: 1800000000, nanoseconds: 0 } as any,
    notes: '',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('maintenanceService', () => {
  it('create adiciona manutenção com completed=false', () => {
    const m = maintenanceService.create(validFormData())
    expect(m.id).toBeDefined()
    expect(m.completed).toBe(false)
    expect(m.completedAt).toBeNull()
    expect(m.type).toBe('cleaning')
  })

  it('getAll retorna todas as manutenções', () => {
    maintenanceService.create(validFormData())
    maintenanceService.create(validFormData({ type: 'restoration' }))
    expect(maintenanceService.getAll()).toHaveLength(2)
  })

  it('getByPC retorna manutenções de um PC', () => {
    maintenanceService.create(validFormData({ pcId: 'pc-1' }))
    maintenanceService.create(validFormData({ pcId: 'pc-2' }))
    const result = maintenanceService.getByPC('pc-1')
    expect(result).toHaveLength(1)
    expect(result[0].pcId).toBe('pc-1')
  })

  it('getUpcoming retorna manutenções não concluídas ordenadas por data', () => {
    maintenanceService.create(validFormData({ scheduledDate: { seconds: 2000000000, nanoseconds: 0 } as any }))
    maintenanceService.create(validFormData({ scheduledDate: { seconds: 1000000000, nanoseconds: 0 } as any }))
    const upcoming = maintenanceService.getUpcoming()
    expect(upcoming).toHaveLength(2)
    expect(upcoming[0].scheduledDate.seconds).toBe(1000000000)
    expect(upcoming[1].scheduledDate.seconds).toBe(2000000000)
  })

  it('getUpcoming exclui manutenções concluídas', () => {
    maintenanceService.create(validFormData())
    const done = maintenanceService.create(validFormData())
    maintenanceService.update(done.id, { completed: true, completedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any })
    expect(maintenanceService.getUpcoming()).toHaveLength(1)
  })

  it('update modifica campos', () => {
    const m = maintenanceService.create(validFormData())
    maintenanceService.update(m.id, { notes: 'Urgente' })
    expect(maintenanceService.getById(m.id)?.notes).toBe('Urgente')
  })

  it('remove deleta manutenção', () => {
    const m = maintenanceService.create(validFormData())
    maintenanceService.remove(m.id)
    expect(maintenanceService.getById(m.id)).toBeUndefined()
  })
})
