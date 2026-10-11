import { activeWorkspaceId, currentUserId, requireDb, toRow, toRows } from './client'
import { toAsset } from './mappers'
import { toPatrimonioError, validationError } from './errors'
import { isAssetStatus } from './types'
import type {
  AssetCondition,
  AssetStatus,
  PatrimonioAsset,
  PatrimonioAssetCreateInput,
  PatrimonioAssetUpdateInput,
} from './types'

/**
 * Repositório de ATIVOS (`public.assets`, 024 + 093).
 *
 * Somente campos "frios" são gravados aqui. Os campos de custódia —
 * `location_id`, `responsible_id` e `status` — NÃO são editáveis por este
 * repositório: o schema (094) os bloqueia em UPDATE direto e exige que a
 * mudança passe por `asset_movements` (ver `movements.ts`). A EXCEÇÃO é a
 * CRIAção, onde o estado inicial de custódia é aceito e vira o movimento
 * `criacao` (a guarda 097 valida a unidade das referências). A `condition`
 * (estado físico) é fria e editável.
 *
 * `create` e `update` EXIGEM o `workspaceId` explícito: a unidade enviada à
 * camada de dados é sempre a SELECIONADA no momento da operação, sem depender
 * do timing de sincronização do `workspaceStore` (ver `AssetListOptions.workspaceId`).
 * Toda leitura/escrita é escopada ao workspace e à RLS (`patrimonio.view` para
 * ler; `patrimonio.asset.create/edit` para escrever).
 */

/** Tamanho de página padrão. Ver `docs/patrimonio/data-layer.md`. */
export const ASSET_LIST_DEFAULT_LIMIT = 200
export const ASSET_LIST_MAX_LIMIT = 1000

export interface AssetListOptions {
  status?: AssetStatus
  condition?: AssetCondition
  locationId?: string
  responsibleId?: string
  /** Busca textual em nome / tombo / número de série. */
  search?: string
  limit?: number
  offset?: number
  /**
   * Unidade a escopar. Sem isto, usa a unidade ativa da sessão.
   *
   * Existe para a UI fixar a consulta à unidade SELECIONADA no momento da
   * chamada: o `workspaceStore` é sincronizado por um efeito do provider que
   * roda DEPOIS dos efeitos das páginas, então ler a unidade ativa "do store"
   * dentro de um fetch disparado pela troca de unidade pegaria a unidade
   * ANTERIOR. O escopo explícito elimina essa corrida. A RLS continua sendo a
   * autoridade: passar uma unidade sem acesso é negado pelo banco.
   */
  workspaceId?: string
}

/**
 * Sanitiza o termo para uso em `.or(...)` do PostgREST: remove os meta-caracteres
 * que quebrariam a sintaxe do filtro (vírgula, parênteses). Não é a autorização —
 * é só higiene de entrada.
 */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()\\%]/g, ' ').replace(/\s+/g, ' ').trim()
}

function clampLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return ASSET_LIST_DEFAULT_LIMIT
  }
  return Math.min(Math.floor(limit), ASSET_LIST_MAX_LIMIT)
}

interface AssetPayload {
  name: string
  equipment_type: string
  asset_tag: string | null
  serial_number: string | null
  manufacturer: string
  model: string
  /** Estado inicial de custódia; o histórico `criacao` (094) o registra. */
  location_id: string | null
  responsible_id: string | null
  status: AssetStatus
  condition: AssetCondition | undefined
  notes: string
  metadata: Record<string, unknown>
}

function normalizeId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function buildCreatePayload(input: PatrimonioAssetCreateInput): AssetPayload {
  const name = input.name?.trim()
  if (!name) throw validationError('O nome do equipamento é obrigatório.')
  const equipmentType = input.equipment_type?.trim()
  if (!equipmentType) throw validationError('O tipo do equipamento é obrigatório.')
  if (input.status !== undefined && !isAssetStatus(input.status)) {
    throw validationError('Estado inicial inválido.')
  }
  return {
    name,
    equipment_type: equipmentType,
    asset_tag: input.asset_tag?.trim() || null,
    serial_number: input.serial_number?.trim() || null,
    manufacturer: input.manufacturer?.trim() ?? '',
    model: input.model?.trim() ?? '',
    location_id: normalizeId(input.location_id),
    responsible_id: normalizeId(input.responsible_id),
    status: input.status ?? 'draft',
    condition: input.condition,
    notes: input.notes?.trim() ?? '',
    metadata: input.metadata ?? {},
  }
}

/** Mantém só chaves conhecidas de campos frios — nada de local/responsável/status. */
function buildUpdatePayload(input: PatrimonioAssetUpdateInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw validationError('O nome do equipamento é obrigatório.')
    payload.name = name
  }
  if (input.equipment_type !== undefined) {
    const equipmentType = input.equipment_type.trim()
    if (!equipmentType) throw validationError('O tipo do equipamento é obrigatório.')
    payload.equipment_type = equipmentType
  }
  if (input.asset_tag !== undefined) payload.asset_tag = input.asset_tag?.trim() || null
  if (input.serial_number !== undefined) {
    payload.serial_number = input.serial_number?.trim() || null
  }
  if (input.manufacturer !== undefined) payload.manufacturer = input.manufacturer.trim()
  if (input.model !== undefined) payload.model = input.model.trim()
  if (input.condition !== undefined) payload.condition = input.condition
  if (input.notes !== undefined) payload.notes = input.notes.trim()
  if (input.metadata !== undefined) payload.metadata = input.metadata
  if (Object.keys(payload).length === 0) {
    throw validationError('Nenhum campo válido para atualizar.')
  }
  return payload
}

export const assetsRepository = {
  async list(options: AssetListOptions = {}): Promise<PatrimonioAsset[]> {
    const db = requireDb()
    const ws = options.workspaceId ?? activeWorkspaceId()
    const limit = clampLimit(options.limit)
    const offset = Math.max(0, Math.floor(options.offset ?? 0))

    let query = db
      .from('assets')
      .select('*')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (options.status) query = query.eq('status', options.status)
    if (options.condition) query = query.eq('condition', options.condition)
    if (options.locationId) query = query.eq('location_id', options.locationId)
    if (options.responsibleId) query = query.eq('responsible_id', options.responsibleId)
    const term = options.search ? sanitizeSearch(options.search) : ''
    if (term) {
      query = query.or(
        `name.ilike.%${term}%,asset_tag.ilike.%${term}%,serial_number.ilike.%${term}%`,
      )
    }

    const { data, error } = await query
    if (error) throw toPatrimonioError(error)
    return toRows(data).map(toAsset)
  },

  async get(id: string, workspaceId?: string): Promise<PatrimonioAsset> {
    const db = requireDb()
    const ws = workspaceId ?? activeWorkspaceId()
    if (!id) throw validationError('Ativo inválido.')
    const { data, error } = await db
      .from('assets')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', ws)
      .single()
    if (error) throw toPatrimonioError(error)
    return toAsset(toRow(data))
  },

  async create(input: PatrimonioAssetCreateInput, workspaceId: string): Promise<PatrimonioAsset> {
    const db = requireDb()
    const ws = workspaceId
    const payload = buildCreatePayload(input)
    const { data, error } = await db
      .from('assets')
      .insert({
        ...payload,
        workspace_id: ws,
        created_by: currentUserId(),
      })
      .select('*')
      .single()
    if (error) throw toPatrimonioError(error)
    return toAsset(toRow(data))
  },

  async update(
    id: string,
    input: PatrimonioAssetUpdateInput,
    workspaceId: string,
  ): Promise<PatrimonioAsset> {
    const db = requireDb()
    const ws = workspaceId
    if (!id) throw validationError('Ativo inválido.')
    const payload = buildUpdatePayload(input)
    const { data, error } = await db
      .from('assets')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ws)
      .select('*')
      .single()
    if (error) throw toPatrimonioError(error)
    return toAsset(toRow(data))
  },
}
