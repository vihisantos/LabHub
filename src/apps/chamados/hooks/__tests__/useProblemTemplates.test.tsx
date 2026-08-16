import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ProblemTemplate } from '../../types'

const mockInitDefaults = vi.hoisted(() => vi.fn())
const mockGetAll = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockRemove = vi.hoisted(() => vi.fn())

vi.mock('../../services/problemTemplateService', () => ({
  problemTemplateService: {
    initDefaults: mockInitDefaults,
    getAll: mockGetAll,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
  },
}))

import { useProblemTemplates } from '../useProblemTemplates'

function makeTemplate(overrides: Partial<ProblemTemplate> = {}): ProblemTemplate {
  return {
    id: 'tpl-1',
    assetType: 'Desktop',
    categories: ['Não liga', 'Outro'],
    createdAt: '2026-06-25T12:00:00Z',
    updatedAt: '2026-06-25T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useProblemTemplates', () => {
  it('carrega com initDefaults e ordena por tipo de ativo', async () => {
    mockGetAll.mockReturnValue([
      makeTemplate({ id: 'a', assetType: 'Zebra' }),
      makeTemplate({ id: 'b', assetType: 'Alfa' }),
    ])

    const { result } = renderHook(() => useProblemTemplates())
    await act(async () => {})

    expect(mockInitDefaults).toHaveBeenCalledTimes(1)
    expect(result.current.templates.map((t) => t.assetType)).toEqual(['Alfa', 'Zebra'])
    expect(result.current.loading).toBe(false)
  })

  it('getByAssetType encontra o template', async () => {
    mockGetAll.mockReturnValue([
      makeTemplate({ id: 'a', assetType: 'Desktop' }),
      makeTemplate({ id: 'b', assetType: 'Projetor' }),
    ])

    const { result } = renderHook(() => useProblemTemplates())
    await act(async () => {})

    expect(result.current.getByAssetType('Projetor')?.id).toBe('b')
    expect(result.current.getByAssetType('TV')).toBeUndefined()
  })

  it('create: adiciona e ordena', async () => {
    mockGetAll.mockReturnValue([makeTemplate({ id: 'a', assetType: 'Alfa' })])
    mockCreate.mockReturnValue(makeTemplate({ id: 'novo', assetType: 'Zebra' }))

    const { result } = renderHook(() => useProblemTemplates())
    await act(async () => {})

    act(() => {
      result.current.create({ assetType: 'Zebra', categories: ['Outro'] })
    })

    expect(result.current.templates.map((t) => t.assetType)).toEqual(['Alfa', 'Zebra'])
  })

  it('update e remove', async () => {
    mockGetAll.mockReturnValue([makeTemplate({ id: 'a', assetType: 'Alfa' })])
    mockUpdate.mockReturnValue(makeTemplate({ id: 'a', assetType: 'Bravo' }))
    mockRemove.mockReturnValue(true)

    const { result } = renderHook(() => useProblemTemplates())
    await act(async () => {})

    act(() => {
      result.current.update('a', { assetType: 'Bravo' })
    })
    expect(result.current.templates[0].assetType).toBe('Bravo')

    act(() => {
      result.current.remove('a')
    })
    expect(result.current.templates).toHaveLength(0)
  })
})
