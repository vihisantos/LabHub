import { activeWorkspaceId, requireDb, toRow, toRows } from './client'
import { toLocation } from './mappers'
import { toPatrimonioError, validationError } from './errors'
import type { PatrimonioLocation, PatrimonioLocationInput } from './types'

/**
 * Repositório de LOCAIS do Patrimônio (`public.patrimonio_locations`, 091).
 *
 * Leitura exige `patrimonio.view`; escrita exige `patrimonio.locations.manage`
 * — tudo resolvido pela RLS no banco. Não tratamos permissão no client.
 */

interface LocationPayload {
  predio: string
  andar: string
  nome: string
  complemento: string
  notes: string
}

function buildPayload(input: PatrimonioLocationInput): LocationPayload {
  const nome = input.nome?.trim()
  if (!nome) {
    throw validationError('O nome do local é obrigatório.')
  }
  return {
    predio: input.predio?.trim() ?? '',
    andar: input.andar?.trim() ?? '',
    nome,
    complemento: input.complemento?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
  }
}

export const locationsRepository = {
  async list(): Promise<PatrimonioLocation[]> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    const { data, error } = await db
      .from('patrimonio_locations')
      .select('*')
      .eq('workspace_id', ws)
      .order('nome', { ascending: true })
    if (error) throw toPatrimonioError(error)
    return toRows(data).map(toLocation)
  },

  async create(input: PatrimonioLocationInput): Promise<PatrimonioLocation> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    const payload = buildPayload(input)
    const { data, error } = await db
      .from('patrimonio_locations')
      .insert({ ...payload, workspace_id: ws })
      .select('*')
      .single()
    if (error) throw toPatrimonioError(error)
    return toLocation(toRow(data))
  },

  async update(id: string, input: PatrimonioLocationInput): Promise<PatrimonioLocation> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    if (!id) throw validationError('Local inválido.')
    const payload = buildPayload(input)
    const { data, error } = await db
      .from('patrimonio_locations')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', ws)
      .select('*')
      .single()
    if (error) throw toPatrimonioError(error)
    return toLocation(toRow(data))
  },

  async remove(id: string): Promise<void> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    if (!id) throw validationError('Local inválido.')
    const { error } = await db
      .from('patrimonio_locations')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ws)
    if (error) throw toPatrimonioError(error)
  },
}
