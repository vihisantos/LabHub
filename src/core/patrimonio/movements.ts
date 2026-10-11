import { activeWorkspaceId, requireDb, toRow, toRows } from './client'
import { toMovement } from './mappers'
import { toPatrimonioError, validationError } from './errors'
import {
  INVENTORY_TARGET_STATUSES,
  RESPONSIBLE_TARGET_STATUSES,
  TRANSFER_TARGET_STATUSES,
  isAssetStatus,
  isRegistrableMovementType,
  type AssetMovement,
  type AssetMovementInput,
  type AssetStatus,
} from './types'

/**
 * Repositório de MOVIMENTAÇÕES (`public.asset_movements`, 094) — o ÚNICO
 * caminho sancionado para mudar local, responsável ou status de um ativo.
 *
 * Por que só existe INSERT aqui:
 *   · a tabela é append-only de verdade — não há policy nem grant de
 *     UPDATE/DELETE (nem para super admin); correções são um movimento novo
 *     `correcao`;
 *   · o efeito no ativo (local/responsável/status) é aplicado por uma trigger
 *     BEFORE INSERT, NA MESMA TRANSAÇÃO, com lock e validação de workspace —
 *     então "atualizar o ativo + registrar a movimentação" é UMA declaração
 *     atômica, e não duas escritas independentes que poderiam divergir;
 *   · `performed_by`, `performed_by_nome`, `source`, `import_batch_id` são
 *     definidos pela trigger a partir da sessão — o cliente NUNCA os envia.
 *
 * A validação local abaixo é um pré-voo de UX (falha cedo, sem round-trip).
 * A AUTORIDADE sobre as regras de estado permanece na trigger do banco: se
 * divergirem, o banco vence e o erro é traduzido por `toPatrimonioError`.
 */

/** Tamanho de página padrão para listagens de histórico. */
export const MOVEMENT_LIST_DEFAULT_LIMIT = 100
export const MOVEMENT_LIST_MAX_LIMIT = 500

export interface MovementListOptions {
  limit?: number
  offset?: number
}

function clampLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return MOVEMENT_LIST_DEFAULT_LIMIT
  }
  return Math.min(Math.floor(limit), MOVEMENT_LIST_MAX_LIMIT)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime())
}

/**
 * Pré-voo das combinações obrigatórias da trigger 094. Não substitui o banco —
 * espelha as exigências estruturais por tipo para dar erro claro sem round-trip.
 */
function validateMovementInput(input: AssetMovementInput): void {
  if (!isNonEmptyString(input.asset_id)) {
    throw validationError('Ativo inválido para a movimentação.')
  }
  if (!isRegistrableMovementType(input.type)) {
    throw validationError('Tipo de movimentação inválido.')
  }
  if (input.to_status != null && !isAssetStatus(input.to_status)) {
    throw validationError('Status de destino inválido.')
  }

  switch (input.type) {
    case 'emprestimo':
      if (!isNonEmptyString(input.to_responsible_id)) {
        throw validationError('Empréstimo exige um responsável.')
      }
      if (!isNonEmptyString(input.expected_return_at) || !isValidDateString(input.expected_return_at)) {
        throw validationError('Empréstimo exige uma data de devolução prevista válida.')
      }
      break
    case 'transferencia':
      if (!isNonEmptyString(input.to_location_id)) {
        throw validationError('Transferência exige o local de destino.')
      }
      if (!input.to_status || !(TRANSFER_TARGET_STATUSES as readonly string[]).includes(input.to_status)) {
        throw validationError('Transferência exige um status de destino válido.')
      }
      break
    case 'responsavel':
      if (!isNonEmptyString(input.to_responsible_id)) {
        throw validationError('Troca de responsável exige o responsável de destino.')
      }
      if (!input.to_status || !(RESPONSIBLE_TARGET_STATUSES as readonly string[]).includes(input.to_status)) {
        throw validationError('Troca de responsável exige um status de destino válido.')
      }
      break
    case 'inventario':
      if (!input.to_status || !(INVENTORY_TARGET_STATUSES as readonly string[]).includes(input.to_status)) {
        throw validationError('Contagem de inventário exige um status de destino válido.')
      }
      break
    case 'devolucao':
    case 'manutencao':
    case 'baixa':
    case 'correcao':
      break
    default: {
      const exhaustive: never = input.type
      throw validationError(`Tipo de movimentação não suportado: ${String(exhaustive)}`)
    }
  }
}

interface MovementInsert {
  workspace_id: string
  asset_id: string
  type: string
  to_location_id: string | null
  to_responsible_id: string | null
  to_status: AssetStatus | null
  expected_return_at: string | null
  note: string
}

function buildInsert(input: AssetMovementInput): MovementInsert {
  return {
    workspace_id: activeWorkspaceId(),
    asset_id: input.asset_id,
    type: input.type,
    to_location_id: input.to_location_id ?? null,
    to_responsible_id: input.to_responsible_id ?? null,
    to_status: input.to_status ?? null,
    expected_return_at: input.expected_return_at ?? null,
    note: input.note?.trim() ?? '',
  }
}

export const movementsRepository = {
  /** Histórico de um ativo, mais recente primeiro. */
  async listByAsset(assetId: string, options: MovementListOptions = {}): Promise<AssetMovement[]> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    if (!isNonEmptyString(assetId)) throw validationError('Ativo inválido.')
    const limit = clampLimit(options.limit)
    const offset = Math.max(0, Math.floor(options.offset ?? 0))
    const { data, error } = await db
      .from('asset_movements')
      .select('*')
      .eq('workspace_id', ws)
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw toPatrimonioError(error)
    return toRows(data).map(toMovement)
  },

  /** Movimentações recentes da unidade (feed de auditoria). */
  async listRecent(options: MovementListOptions = {}): Promise<AssetMovement[]> {
    const db = requireDb()
    const ws = activeWorkspaceId()
    const limit = clampLimit(options.limit)
    const offset = Math.max(0, Math.floor(options.offset ?? 0))
    const { data, error } = await db
      .from('asset_movements')
      .select('*')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw toPatrimonioError(error)
    return toRows(data).map(toMovement)
  },

  /**
   * Registra uma movimentação. Esta é a operação ATÔMICA: a trigger aplica o
   * efeito no ativo na mesma transação. Não existe (e não deve existir) um
   * "updateAsset + registerMovement" separado no client.
   */
  async register(input: AssetMovementInput): Promise<AssetMovement> {
    const db = requireDb()
    validateMovementInput(input)
    const insert = buildInsert(input)
    const { data, error } = await db
      .from('asset_movements')
      .insert(insert)
      .select('*')
      .single()
    if (error) throw toPatrimonioError(error)
    return toMovement(toRow(data))
  },
}
