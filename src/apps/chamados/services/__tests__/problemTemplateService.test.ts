import { describe, it, expect } from 'vitest'
import { problemTemplateService } from '../problemTemplateService'
import { DEFAULT_PROBLEM_TEMPLATES } from '../../types'
import { setCol } from '../../../../lib/db'
import type { ProblemTemplate } from '../../types'

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

describe('problemTemplateService', () => {
  it('começa vazio', () => {
    expect(problemTemplateService.getAll()).toHaveLength(0)
  })

  it('create: serializa com timestamps', () => {
    const tpl = problemTemplateService.create({
      assetType: 'Notebook',
      categories: ['Bateria', 'Tela'],
    })
    expect(tpl.id).toBeTruthy()
    expect(tpl.createdAt).toBeTruthy()
    expect(problemTemplateService.getById(tpl.id)?.assetType).toBe('Notebook')
  })

  it('update e remove', () => {
    setCol('problem_templates', [makeTemplate()])
    const updated = problemTemplateService.update('tpl-1', { categories: ['Tela'] })
    expect(updated?.categories).toEqual(['Tela'])
    expect(problemTemplateService.remove('tpl-1')).toBe(true)
    expect(problemTemplateService.getAll()).toHaveLength(0)
  })

  it('getByAssetType filtra por tipo de ativo', () => {
    setCol('problem_templates', [
      makeTemplate({ id: 'a', assetType: 'Desktop' }),
      makeTemplate({ id: 'b', assetType: 'Projetor' }),
    ])
    expect(problemTemplateService.getByAssetType('Projetor').map((t) => t.id)).toEqual(['b'])
  })

  it('initDefaults: semeia os templates padrão uma única vez', () => {
    problemTemplateService.initDefaults()
    expect(problemTemplateService.getAll()).toHaveLength(DEFAULT_PROBLEM_TEMPLATES.length)

    problemTemplateService.initDefaults()
    expect(problemTemplateService.getAll()).toHaveLength(DEFAULT_PROBLEM_TEMPLATES.length)
    expect(problemTemplateService.getByAssetType('TV')).toHaveLength(1)
  })

  it('initDefaults: não duplica quando já existem registros', () => {
    setCol('problem_templates', [makeTemplate()])
    problemTemplateService.initDefaults()
    expect(problemTemplateService.getAll()).toHaveLength(1)
  })
})
