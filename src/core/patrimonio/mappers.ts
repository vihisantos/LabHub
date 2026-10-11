import {
  isAssetCondition,
  isAssetMovementType,
  isAssetStatus,
  type AssetCondition,
  type AssetMovement,
  type AssetMovementSource,
  type AssetMovementType,
  type AssetStatus,
  type PatrimonioAsset,
  type PatrimonioLocation,
  type PatrimonioResponsible,
} from './types'
import {
  asNullableString,
  asRecord,
  asString,
  field,
} from './client'

/**
 * Conversores `unknown → tipo`. O banco já garante os valores (CHECK): os
 * fallbacks abaixo existem só para nunca propagar um cast de `any` nem quebrar
 * a listagem por uma linha inesperada. Não inventam estado — apenas defendem a
 * borda. Nenhuma validação de negócio acontece aqui (isso é do banco).
 */

function asAssetStatus(value: unknown): AssetStatus {
  return isAssetStatus(value) ? value : 'draft'
}

function asAssetCondition(value: unknown): AssetCondition {
  return isAssetCondition(value) ? value : 'bom'
}

function asMovementType(value: unknown): AssetMovementType {
  return isAssetMovementType(value) ? value : 'correcao'
}

function asMovementSource(value: unknown): AssetMovementSource {
  return value === 'import' || value === 'api' || value === 'ui' ? value : 'ui'
}

export function toLocation(raw: unknown): PatrimonioLocation {
  return {
    id: asString(field(raw, 'id')),
    workspace_id: asString(field(raw, 'workspace_id')),
    predio: asString(field(raw, 'predio')),
    andar: asString(field(raw, 'andar')),
    nome: asString(field(raw, 'nome')),
    complemento: asString(field(raw, 'complemento')),
    notes: asString(field(raw, 'notes')),
    created_at: asString(field(raw, 'created_at')),
    updated_at: asString(field(raw, 'updated_at')),
  }
}

export function toResponsible(raw: unknown): PatrimonioResponsible {
  return {
    id: asString(field(raw, 'id')),
    workspace_id: asString(field(raw, 'workspace_id')),
    nome: asString(field(raw, 'nome')),
    matricula: asNullableString(field(raw, 'matricula')),
    email: asNullableString(field(raw, 'email')),
    profile_id: asNullableString(field(raw, 'profile_id')),
    notes: asString(field(raw, 'notes')),
    created_at: asString(field(raw, 'created_at')),
    updated_at: asString(field(raw, 'updated_at')),
  }
}

export function toAsset(raw: unknown): PatrimonioAsset {
  return {
    id: asString(field(raw, 'id')),
    workspace_id: asString(field(raw, 'workspace_id')),
    asset_tag: asNullableString(field(raw, 'asset_tag')),
    serial_number: asNullableString(field(raw, 'serial_number')),
    equipment_type: asString(field(raw, 'equipment_type'), 'Outro'),
    manufacturer: asString(field(raw, 'manufacturer')),
    model: asString(field(raw, 'model')),
    name: asString(field(raw, 'name')),
    location_id: asNullableString(field(raw, 'location_id')),
    responsible_id: asNullableString(field(raw, 'responsible_id')),
    status: asAssetStatus(field(raw, 'status')),
    condition: asAssetCondition(field(raw, 'condition')),
    notes: asString(field(raw, 'notes')),
    metadata: asRecord(field(raw, 'metadata')),
    created_by: asNullableString(field(raw, 'created_by')),
    created_at: asString(field(raw, 'created_at')),
    updated_at: asString(field(raw, 'updated_at')),
  }
}

export function toMovement(raw: unknown): AssetMovement {
  return {
    id: asString(field(raw, 'id')),
    workspace_id: asString(field(raw, 'workspace_id')),
    asset_id: asString(field(raw, 'asset_id')),
    type: asMovementType(field(raw, 'type')),
    to_location_id: asNullableString(field(raw, 'to_location_id')),
    to_responsible_id: asNullableString(field(raw, 'to_responsible_id')),
    to_status: asNullableString(field(raw, 'to_status')),
    to_responsible_nome: asNullableString(field(raw, 'to_responsible_nome')),
    to_responsible_matricula: asNullableString(field(raw, 'to_responsible_matricula')),
    expected_return_at: asNullableString(field(raw, 'expected_return_at')),
    note: asString(field(raw, 'note')),
    performed_by: asNullableString(field(raw, 'performed_by')),
    performed_by_nome: asNullableString(field(raw, 'performed_by_nome')),
    source: asMovementSource(field(raw, 'source')),
    import_batch_id: asNullableString(field(raw, 'import_batch_id')),
    created_at: asString(field(raw, 'created_at')),
  }
}
