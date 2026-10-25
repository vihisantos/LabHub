export type TourStep = {
  /** Seletor CSS do elemento a ser destacado. Use '__theme__' para o passo de tema. */
  selector: string
  title: string
  description: string
  /**
   * Quando true, o tour aguarda o usuário clicar no elemento antes de avançar.
   * Ativa o modo "tutorial guiado interativo".
   */
  interactive?: boolean
  moduleId?: string
}

export interface ModuleDefinition {
  id: string
  name: string
  title: string
  description: string
  selector: string
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: 'chamados',
    name: 'Chamados',
    title: '🎫 Módulo de Chamados',
    description: 'Abra, acompanhe e atenda chamados de suporte técnico para salas e laboratórios em tempo real.',
    selector: '[data-tour="module-chamados"]',
  },
  {
    id: 'pc-care',
    name: 'PC Care',
    title: '💻 Módulo PC Care',
    description: 'Gestão completa dos computadores: checklists de limpeza preventiva, manutenção e inventário de peças.',
    selector: '[data-tour="module-pc-care"], [data-tour="module-pcare"]',
  },
  {
    id: 'stock',
    name: 'Estoque',
    title: '📦 Módulo de Estoque',
    description: 'Controle de equipamentos, movimentações de entrada e saída, conferência de kits e saldo de itens.',
    selector: '[data-tour="module-stock"]',
  },
  {
    id: 'reservalab',
    name: 'ReservaLab',
    title: '🧪 Módulo ReservaLab',
    description: 'Agendamento de horários em laboratórios e empréstimo controlado de tablets e carrinhos móveis.',
    selector: '[data-tour="module-reservalab"]',
  },
  {
    id: 'tv',
    name: 'TV Corporativa',
    title: '📺 Módulo TV Corporativa',
    description: 'Mural digital para exibição de comunicados institucionais, avisos e pedidos musicais nos laboratórios.',
    selector: '[data-tour="module-tv"]',
  },
  {
    id: 'patrimonio',
    name: 'Patrimônio',
    title: '🏷️ Módulo de Patrimônio',
    description: 'Identificação e controle de ativos físicos com QR Code, etiquetas e inventário por unidade escolar.',
    selector: '[data-tour="module-patrimonio"]',
  },
  {
    id: 'admin',
    name: 'Administração',
    title: '⚙️ Módulo de Administração',
    description: 'Configurações globais do sistema, gestão de usuários, cargos, permissões e workspaces.',
    selector: '[data-tour="module-admin"], [data-tour="admin-app"]',
  },
]

export const THEME_STEP: TourStep = {
  selector: '__theme__',
  title: '🎨 Personalize sua aparência',
  description: 'Escolha o tema e cor de destaque da plataforma. Você pode mudar isso a qualquer momento no seu perfil.',
}

/**
 * Constrói os passos do onboarding de forma dinâmica com base nos módulos
 * que o usuário REALMENTE tem acesso. Se não tiver acesso ao módulo, ele não aparece.
 */
export function buildTourSteps(accessibleModuleIds: string[], isSuperAdmin?: boolean): TourStep[] {
  const steps: TourStep[] = [
    THEME_STEP,
    {
      selector: '[data-tour="modules-section"]',
      title: '📦 Meus Módulos',
      description:
        'Os módulos são as ferramentas e sistemas integrados do LabHub para a gestão do seu ambiente — como chamados, manutenção, reservas e estoque. Veja a seguir cada módulo liberado para o seu perfil:',
    },
  ]

  // Apresentar cada módulo separadamente, apenas se o usuário tiver acesso
  MODULE_DEFINITIONS.forEach((mod) => {
    const hasAccess = isSuperAdmin || accessibleModuleIds.includes(mod.id)
    if (hasAccess) {
      steps.push({
        selector: mod.selector,
        title: mod.title,
        description: mod.description,
        moduleId: mod.id,
      })
    }
  })

  // Controles essenciais da plataforma
  steps.push({
    selector: '[data-tour="notifications"]',
    title: '🔔 Notificações',
    description: 'Avisos importantes sobre seus chamados, manutenções e novidades chegam aqui em tempo real.',
  })

  steps.push({
    selector: '[data-tour="profile"]',
    title: '👤 Seu Perfil & Configurações',
    description:
      'Acesse seus dados, troque o tema e suas preferências. Você também pode reiniciar este tour quando quiser!',
  })

  return steps
}

export const roleBasedSteps: Record<string, TourStep[]> = {}
export const defaultSteps: TourStep[] = [THEME_STEP]

