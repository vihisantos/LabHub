import { activeWorkspaceId, requireDb, toRow, toRows } from './client'
import { toResponsible } from './mappers'
import { toPatrimonioError, validationError } from './errors'
import type { PatrimonioResponsible, PatrimonioResponsibleInput } from './types'

/**
 * Repositório de RESPONSÁVEIS (`public.patrimonio_responsibles`, 092).
 *
 * Responsável é institucional: matrícula, e-mail e vínculo com conta LabHub
 * (`profile_id`) são TODOS opcionais — um responsável sem conta LabHub é válido
 * e não pode ser descartado. A única regra de forma é `nome` não-vazio.
 */

interface ResponsiblePayload {
  nome: string
  matricula: string | null
  email: string | null
  profile_id: string | null
  notes: string
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildPayload(input: PatrimonioResponsibleInput): ResponsiblePayload {
  const nome = input.nome?.trim()
  if (!nome) {
    throw validationError('O nome do responsável é obrigatório.')
  }
  return {
    nome,
    matricula: normalizeOptional(input.matricula),
    email: normalizeOptional(input.email),
    profile_id: normalizeOptional(input.profile_id),
    notes: input.notes?.trim() ?? '',
  }
}

export const responsiblesRepository = {
  async list(workspaceId?: string): Promise<PatrimonioResponsible[]> {
    const db = requireDb()
    const ws = workspaceId ?? activeWorkspaceId()
    const { data, error } = await db
      .from('patrimonio_responsibles')
      .select('*')
      .eq('workspace_id', ws)
      .order('nome', { ascending: true })
    if (error) throw toPatrimonioError(error)
    return toRows(data).map(toResponsible)
  },

  async create(input: PatrimonioResponsibleInput): Promise<PatrimonioResponsible> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    const payload = buildPayload(input)
    const { data, error } = await db
      .from('patrimonio_responsibles')
      .insert({ ...payload, workspace_id: ws })
      .select('*')
      .single()
    if (error) throw toPatrimonioError(error)
    return toResponsible(toRow(data))
  },

  async update(id: string, input: PatrimonioResponsibleInput): Promise<PatrimonioResponsible> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    if (!id) throw validationError('Responsável inválido.')
    const payload = buildPayload(input)
    const { data, error } = await db
      .from('patrimonio_responsibles')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', ws)
      .select('*')
      .single()
    if (error) throw toPatrimonioError(error)
    return toResponsible(toRow(data))
  },

  async remove(id: string): Promise<void> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    if (!id) throw validationError('Responsável inválido.')
    const { error } = await db
      .from('patrimonio_responsibles')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ws)
    if (error) throw toPatrimonioError(error)
  },
}
