/**
 * Tipos do Patrimônio institucional de TI (issue #289).
 *
 * Esta é a camada de dados do módulo Patrimônio. Os tipos espelham EXATAMENTE
 * o schema real criado/evoluído pelas migrations 024 e 091–096:
 *
 *   · public.assets                 (024 + 093)  — o equipamento
 *   · public.patrimonio_locations   (091)        — local estruturado
 *   · public.patrimonio_responsibles(092)        — diretório de responsáveis
 *   · public.asset_movements        (094)        — histórico append-only
 *
 * Regras que os tipos refletem (não são decisões desta camada — são o banco):
 *   · `condition` (estado físico) é INDEPENDENTE de `status` (custódia/fluxo);
 *     "danificado" é condição, nunca status (093).
 *   · `status` segue o ciclo oficial e `baixado` é terminal (093/094).
 *   · responsável é institucional e NÃO exige conta LabHub (`profile_id`
 *     opcional); matrícula é opcional (092).
 *   · toda mudança de local/responsável/status acontece via INSERT em
 *     `asset_movements` — os campos "quentes" do ativo não são editáveis
 *     diretamente (094).
 *
 * Nenhuma coluna, tabela ou estado inventado: qualquer valor aqui existe no
 * banco. Qualquer divergência é bug.
 */

import type { PatrimonioError } from './errors'

// ---------------------------------------------------------------------------
// Enums reais do banco (CHECK constraints)
// ---------------------------------------------------------------------------

/** Estado FÍSICO do ativo (093). Independente da custódia. */
export const ASSET_CONDITIONS = ['novo', 'bom', 'regular', 'danificado', 'inservivel'] as const
export type AssetCondition = (typeof ASSET_CONDITIONS)[number]

/**
 * Custódia / estágio no fluxo (093). `baixado` é TERMINAL: só um movimento
 * `correcao` pode voltar (094).
 */
export const ASSET_STATUSES = [
  'draft',
  'disponivel',
  'em_uso',
  'emprestado',
  'manutencao',
  'em_transito',
  'nao_localizado',
  'baixado',
] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

/** Tipos de movimento aceitos pelo banco (094). */
export const ASSET_MOVEMENT_TYPES = [
  'criacao',
  'transferencia',
  'responsavel',
  'emprestimo',
  'devolucao',
  'manutencao',
  'baixa',
  'inventario',
  'correcao',
] as const
export type AssetMovementType = (typeof ASSET_MOVEMENT_TYPES)[number]

/**
 * Movimentos que a camada de dados pode REGISTRAR explicitamente por um cliente
 * autenticado. `criacao` é gerado automaticamente pelo trigger de INSERT do
 * ativo (094) e um `criacao` enviado pelo cliente é REJEITADO pelo banco — por
 * isso não faz parte da entrada de `register`.
 */
export const REGISTRABLE_MOVEMENT_TYPES = [
  'transferencia',
  'responsavel',
  'emprestimo',
  'devolucao',
  'manutencao',
  'baixa',
  'inventario',
  'correcao',
] as const
export type RegistrableMovementType = (typeof REGISTRABLE_MOVEMENT_TYPES)[number]

/** Procedência do movimento (094). Cliente autenticado sempre grava 'ui'. */
export const ASSET_MOVEMENT_SOURCES = ['ui', 'import', 'api'] as const
export type AssetMovementSource = (typeof ASSET_MOVEMENT_SOURCES)[number]

/** Tipos de equipamento (lista de UI — coluna é TEXT livre). */
export const EQUIPMENT_TYPES = [
  'Desktop', 'Notebook', 'All in One', 'Mac Mini', 'MacBook',
  'Monitor', 'Projetor', 'Impressora', 'Switch', 'Access Point',
  'Televisão', 'Webcam', 'Mesa de Som', 'Microfone', 'Câmera',
  'Outro',
] as const
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]

/** Equipamento que o trigger aceita em transferencia/responsavel/inventario. */
export const TRANSFER_TARGET_STATUSES = ['em_transito', 'disponivel', 'em_uso'] as const
export const RESPONSIBLE_TARGET_STATUSES = ['em_uso', 'disponivel'] as const
export const INVENTORY_TARGET_STATUSES = ['nao_localizado', 'disponivel', 'em_uso'] as const

// ---------------------------------------------------------------------------
// Rótulos (UI). Mantidos aqui para uma única fonte de verdade com os enums.
// ---------------------------------------------------------------------------

export const ASSET_CONDITION_LABELS: Record<AssetCondition, string> = {
  novo: 'Novo',
  bom: 'Bom',
  regular: 'Regular',
  danificado: 'Danificado',
  inservivel: 'Inservível',
}

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  draft: 'Rascunho',
  disponivel: 'Disponível',
  em_uso: 'Em uso',
  emprestado: 'Emprestado',
  manutencao: 'Em manutenção',
  em_transito: 'Em trânsito',
  nao_localizado: 'Não localizado',
  baixado: 'Baixado',
}

export const ASSET_MOVEMENT_TYPE_LABELS: Record<AssetMovementType, string> = {
  criacao: 'Criação',
  transferencia: 'Transferência',
  responsavel: 'Troca de responsável',
  emprestimo: 'Empréstimo',
  devolucao: 'Devolução',
  manutencao: 'Manutenção',
  baixa: 'Baixa',
  inventario: 'Inventário',
  correcao: 'Correção',
}

// ---------------------------------------------------------------------------
// Linhas das tabelas (snake_case — igual ao banco)
// ---------------------------------------------------------------------------

export interface PatrimonioLocation {
  id: string
  workspace_id: string
  predio: string
  andar: string
  nome: string
  complemento: string
  notes: string
  created_at: string
  updated_at: string
}

export interface PatrimonioResponsible {
  id: string
  workspace_id: string
  nome: string
  /** Opcional (092). Único por unidade quando presente. */
  matricula: string | null
  /** Opcional; não é a única via (092). */
  email: string | null
  /** Conta LabHub OPCIONAL — vínculo, não requisito (092). */
  profile_id: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface PatrimonioAsset {
  id: string
  workspace_id: string
  /** Patrimônio (tombo). Único por unidade quando presente (024). */
  asset_tag: string | null
  serial_number: string | null
  equipment_type: string
  manufacturer: string
  model: string
  name: string
  /** FK → patrimonio_locations; ON DELETE RESTRICT (093). */
  location_id: string | null
  /** FK → patrimonio_responsibles; ON DELETE RESTRICT (093). */
  responsible_id: string | null
  status: AssetStatus
  condition: AssetCondition
  notes: string
  metadata: Record<string, unknown>
  /** Autoria do registro (coluna explícita da 024). */
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AssetMovement {
  id: string
  workspace_id: string
  asset_id: string
  type: AssetMovementType
  to_location_id: string | null
  to_responsible_id: string | null
  to_status: string | null
  /** Snapshot do responsável no momento do movimento (imune a renomeação). */
  to_responsible_nome: string | null
  to_responsible_matricula: string | null
  expected_return_at: string | null
  note: string
  performed_by: string | null
  /** Snapshot do autor (resiste à exclusão futura do perfil). */
  performed_by_nome: string | null
  source: AssetMovementSource
  import_batch_id: string | null
  created_at: string
}

/**
 * Diretórios de referência da unidade: locais e responsáveis.
 * Usado para resolver IDs em rótulos legíveis.
 */
export interface PatrimonioReferences {
  locations: PatrimonioLocation[]
  responsibles: PatrimonioResponsible[]
  loading: boolean
  error: PatrimonioError | null
  locationLabel: (id: string | null) => string | null
  responsibleLabel: (id: string | null) => string | null
  reload: () => void
}

// ---------------------------------------------------------------------------
// Entradas (o que o chamador fornece)
// ---------------------------------------------------------------------------

export interface PatrimonioLocationInput {
  predio?: string
  andar?: string
  nome: string
  complemento?: string
  notes?: string
}

export interface PatrimonioResponsibleInput {
  nome: string
  matricula?: string | null
  email?: string | null
  profile_id?: string | null
  notes?: string
}

/**
 * Campos "frios" de um ativo: os que o cliente pode criar diretamente. Na
 * CRIAÇÃO o estado inicial de custódia — `location_id`, `responsible_id` e
 * `status` — TAMBÉM é aceito: o INSERT em `assets` gera o movimento `criacao`
 * (094) que registra esses valores como o início da história do bem. A guarda
 * 097 valida server-side que local/responsável iniciais pertencem à MESMA
 * unidade; depois de criado, esses três campos mudam só via `asset_movements`.
 * A `condition` entra porque é estado físico, não custódia.
 */
export interface PatrimonioAssetCreateInput {
  name: string
  equipment_type: string
  asset_tag?: string | null
  serial_number?: string | null
  manufacturer?: string
  model?: string
  /** Local inicial (vira o `to_location_id` do movimento `criacao`). */
  location_id?: string | null
  /** Responsável inicial (vira o `to_responsible_id` do movimento `criacao`). */
  responsible_id?: string | null
  /** Estado inicial de custódia. Default no banco: 'draft'. */
  status?: AssetStatus
  condition?: AssetCondition
  notes?: string
  metadata?: Record<string, unknown>
}

/**
 * Atualização direta permitida em `assets`. Subconjunto estrito dos campos
 * frios — sem local/responsável/status (só via `movements.register`).
 */
export type PatrimonioAssetUpdateInput = Partial<
  Pick<
    PatrimonioAsset,
    | 'name'
    | 'equipment_type'
    | 'asset_tag'
    | 'serial_number'
    | 'manufacturer'
    | 'model'
    | 'condition'
    | 'notes'
    | 'metadata'
  >
>

/**
 * Entrada de um movimento. O banco valida as combinações (094): empréstimo
 * exige responsável + `expected_return_at`; transferência exige local; etc.
 * A camada de dados só tipa o que é comum a todos e deixa as regras de estado
 * no banco (fonte única de verdade).
 */
export interface AssetMovementInput {
  asset_id: string
  type: RegistrableMovementType
  to_location_id?: string | null
  to_responsible_id?: string | null
  to_status?: AssetStatus | null
  expected_return_at?: string | null
  note?: string
}

// ---------------------------------------------------------------------------
// Validação mínima de tipo (evita `any` e cast inseguro na borda do banco)
// ---------------------------------------------------------------------------

export function isAssetCondition(value: unknown): value is AssetCondition {
  return typeof value === 'string' && (ASSET_CONDITIONS as readonly string[]).includes(value)
}

export function isAssetStatus(value: unknown): value is AssetStatus {
  return typeof value === 'string' && (ASSET_STATUSES as readonly string[]).includes(value)
}

export function isAssetMovementType(value: unknown): value is AssetMovementType {
  return typeof value === 'string' && (ASSET_MOVEMENT_TYPES as readonly string[]).includes(value)
}

export function isRegistrableMovementType(value: unknown): value is RegistrableMovementType {
  return (
    typeof value === 'string' &&
    (REGISTRABLE_MOVEMENT_TYPES as readonly string[]).includes(value)
  )
}
