import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pcService } from '../../apps/pcare/services/pcService'
import { stockService } from '../../apps/stock/services/stockService'
import { ticketService } from '../../apps/chamados/services/ticketService'
import { useModuleVisibilities } from '../../core/permissions/useModuleVisibility'
import { icons } from '../../lib/icons'

interface ModuleStat {
  id: string
  name: string
  /** Componente do ícone — guardado como tipo, não como elemento já montado. */
  icon: (props: { size?: number }) => React.ReactNode
  route: string
  stats: { label: string; value: number | string }[]
}

// id do módulo → id do appRegistry
const MODULE_APP_ID: Record<string, string> = {
  pcare: 'pc-care',
  chamados: 'chamados',
  stock: 'stock',
  reservalab: 'reservalab',
  tv: 'tv',
}

/**
 * Resumo por Módulo — cartão de cada módulo acessível, com os números em
 * destaque.
 *
 * A identidade visual vem do TEMA: o cartão usa `--bg-module-card` (um passo
 * fora do branco na direção da cor de identidade, para o bloco se destacar sem
 * virar outra cor), o tile do ícone usa `--accent-soft` e o glifo usa
 * `--accent-strong`, o mesmo accent que o usuário escolhe no Perfil. Nada de
 * cor fixa por módulo, e o ícone tem 3:1 de contraste sobre o tile em Claro,
 * Sutil e Escuro — usar `--accent` direto sumiria com emerald e cyan.
 *
 * A lista de módulos e o filtro de acesso NÃO mudam: continuam vindo de
 * `isModuleAvailable` sobre o `MODULE_APP_ID`, exatamente como antes.
 */
export function ModuleStats() {
  const navigate = useNavigate()
  // RBAC 2.0 (F2-D-L): só a FONTE da visibilidade muda. O eixo
  // `disabled_apps` continua incluído (o legado usava `isModuleAvailable`), e os
  // dados exibidos são os mesmos — a leitura dos services segue no mesmo memo.
  const { isVisible } = useModuleVisibilities(Object.values(MODULE_APP_ID))

  const modules = useMemo<ModuleStat[]>(() => {
    const pcs = pcService.getAll()
    const stockItems = stockService.getAll()
    const tickets = ticketService.getAll()

    const openTickets = tickets.filter(
      (t) => t.status === 'aberto' || t.status === 'a_caminho' || t.status === 'em_atendimento',
    )
    const resolvedToday = tickets.filter((t) => {
      if (!t.resolvedAt) return false
      const today = new Date().toISOString().slice(0, 10)
      return t.resolvedAt.startsWith(today)
    })

    return [
      {
        id: 'pcare',
        name: 'PC Care',
        icon: icons.nav.pcs,
        route: '/pc-care',
        stats: [
          { label: 'PCs', value: pcs.length },
          { label: 'Com problemas', value: pcs.filter((p) => p.cleaningStatus === 'pending').length },
        ],
      },
      {
        id: 'chamados',
        name: 'Chamados',
        icon: icons.ui.messageSquareWarning,
        route: '/chamados',
        stats: [
          { label: 'Abertos', value: openTickets.length },
          { label: 'Resolvidos hoje', value: resolvedToday.length },
        ],
      },
      {
        id: 'stock',
        name: 'Estoque',
        icon: icons.ui.package,
        route: '/stock',
        stats: [
          { label: 'Itens', value: stockItems.length },
          { label: 'Em uso', value: stockItems.filter((i) => i.status === 'emprestado').length },
        ],
      },
      {
        id: 'reservalab',
        name: 'ReservaLab',
        icon: icons.ui.flaskConical,
        route: '/reservalab',
        stats: [{ label: 'Laboratórios', value: 'Reservas e tablets' }],
      },
      {
        id: 'tv',
        name: 'TV Corporativa',
        icon: icons.ui.tv,
        route: '/tv',
        stats: [{ label: 'Display', value: 'Mural digital' }],
      },
    ].filter((m) => isVisible(MODULE_APP_ID[m.id]))
    // Só `isVisible` participa: o eixo `disabled_apps` já está resolvido dentro
    // dele (a fonte nova), então `workspace` não é mais lido neste memo.
  }, [isVisible])

  return (
    <section aria-labelledby="resumo-modulos-titulo">
      <h3 id="resumo-modulos-titulo" className="mb-3 px-1 text-xs font-semibold text-fg-muted">
        Resumo por Módulo
      </h3>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((mod) => {
          const Icon = mod.icon
          const [primary, ...rest] = mod.stats
          return (
            <li key={mod.id}>
              <button
                type="button"
                onClick={() => navigate(mod.route)}
                className="group flex w-full items-center gap-3 rounded-2xl bg-module-card p-3.5 text-left shadow-[var(--shadow-card)] ring-1 ring-line transition-all hover:shadow-[var(--shadow-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] motion-reduce:active:scale-100"
              >
                <span
                  data-testid="mod-icon"
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
                >
                  <Icon size={21} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-sm font-semibold text-fg">{mod.name}</span>
                    <icons.ui.chevronRight
                      size={14}
                      className="shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    />
                  </span>

                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-fg-muted">
                    <StatValue stat={primary} />
                  </span>
                </span>

                {rest.length > 0 && (
                  <span
                    aria-hidden="true"
                    className="flex shrink-0 flex-col items-end gap-0.5 border-l border-line pl-3"
                  >
                    {rest.map((stat) => (
                      <span key={stat.label} className="whitespace-nowrap text-right">
                        <span className="block text-sm font-semibold leading-tight text-fg">
                          {stat.value}
                        </span>
                        <span className="block text-[10px] leading-tight text-fg-muted">{stat.label}</span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Stat principal do cartão.
 *
 * Número grande (destaque, o que se quer ver primeiro) com a etiqueta ao lado.
 * Quando o valor é texto ("Reservas e tablets"), não há número para destacar:
 * o texto vira o destaque e a etiqueta some, para não repetir a mesma
 * informação duas vezes.
 */
function StatValue({ stat }: { stat: { label: string; value: number | string } }) {
  if (typeof stat.value === 'string') {
    return <span className="font-medium text-fg-dim">{stat.value}</span>
  }
  return (
    <>
      <span className="text-sm font-semibold text-fg">{stat.value}</span>
      <span className="ml-1">{stat.label}</span>
    </>
  )
}
