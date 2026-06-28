import { actionLogService } from '../actionLogService'

beforeEach(() => {
  localStorage.clear()
})

describe('actionLogService', () => {
  it('log registra uma ação', () => {
    const entry = actionLogService.log('pc-1', 'pc_created', 'PC criado')
    expect(entry.id).toBeDefined()
    expect(entry.pcId).toBe('pc-1')
    expect(entry.type).toBe('pc_created')
    expect(entry.description).toBe('PC criado')
    expect(entry.timestamp).toBeDefined()
  })

  it('getByPC retorna logs de um PC ordenados por timestamp desc', () => {
    actionLogService.log('pc-1', 'pc_created', 'Criado')
    actionLogService.log('pc-1', 'status_changed', 'Status alterado')
    actionLogService.log('pc-2', 'pc_created', 'Outro PC')
    const logs = actionLogService.getByPC('pc-1')
    expect(logs).toHaveLength(2)
    expect(logs.every((l) => l.pcId === 'pc-1')).toBe(true)
    expect(new Date(logs[0].timestamp).getTime()).toBeGreaterThanOrEqual(new Date(logs[1].timestamp).getTime())
  })

  it('getAll retorna todos os logs', () => {
    actionLogService.log('pc-1', 'pc_created', 'Criado')
    actionLogService.log('pc-2', 'pc_created', 'Outro')
    expect(actionLogService.getAll()).toHaveLength(2)
  })
})
