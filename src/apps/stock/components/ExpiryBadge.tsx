import { getExpiryState, formatExpiryDate } from '../utils/expiry'

const STYLES: Record<string, string> = {
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400',
  soon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400',
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400',
}

export function ExpiryBadge({ date }: { date: string }) {
  const { status, days } = getExpiryState(date)
  const label =
    status === 'expired'
      ? `Venceu ${formatExpiryDate(date)}`
      : status === 'soon'
        ? `${formatExpiryDate(date)} · ${days === 0 ? 'vence hoje' : `vence em ${days} ${days === 1 ? 'dia' : 'dias'}`}`
        : `Válido até ${formatExpiryDate(date)}`

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STYLES[status]}`}>
      {label}
    </span>
  )
}
