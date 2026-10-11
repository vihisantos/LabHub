/**
 * Patrimônio institucional de TI — camada de dados (issue #289, PR-2).
 *
 * Ponto de entrada único. Nenhum componente de UI é exportado daqui: este
 * módulo é a fronteira de dados com o Supabase, protegido por RLS/RBAC no
 * banco. Ver `docs/patrimonio/data-layer.md` para as decisões,
 * limites e o motivo de o Patrimônio NÃO ser integrado ao motor de
 * sincronização local-first neste momento.
 */

export * from './types'
export { PatrimonioError, toPatrimonioError, validationError } from './errors'
export type { PatrimonioErrorCode } from './errors'

export { assetsRepository } from './assets'
export type { AssetListOptions } from './assets'
export { locationsRepository } from './locations'
export { responsiblesRepository } from './responsibles'
export { movementsRepository } from './movements'
export type { MovementListOptions } from './movements'
