import {
  ASSET_CONDITION_LABELS,
  ASSET_STATUS_LABELS,
  type AssetCondition,
  type AssetStatus,
} from '../../../core/patrimonio'

const STATUS_CLASSES: Record<AssetStatus, string> = {
  draft: 'bg-segmented text-fg-muted',
  disponivel: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  em_uso: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  emprestado: 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400',
  manutencao: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  em_transito: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400',
  nao_localizado: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  baixado: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/30 dark:text-fuchsia-400',
}

const CONDITION_CLASSES: Record<AssetCondition, string> = {
  novo: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  bom: 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400',
  regular: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  danificado: 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400',
  inservivel: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
}

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[status]}`}
    >
      {ASSET_STATUS_LABELS[status]}
    </span>
  )
}

export function AssetConditionBadge({ condition }: { condition: AssetCondition }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CONDITION_CLASSES[condition]}`}
    >
      {ASSET_CONDITION_LABELS[condition]}
    </span>
  )
}
