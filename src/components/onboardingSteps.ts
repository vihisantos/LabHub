// Mapeamento de cargos para passos do tour de onboarding.
// Ajuste os seletores CSS, títulos e descrições para os elementos reais do seu app.

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
}

export const roleBasedSteps: Record<string, TourStep[]> = {
  // ── Administrador ─────────────────────────────────────────────────────────
  admin: [
    {
      selector: '[data-tour="admin-app"]',
      title: '⚙️ Painel Admin',
      description: 'Aqui você gerencia usuários, permissões e configurações globais da plataforma.',
      interactive: true,
    },
    {
      selector: '[data-tour="notifications"]',
      title: '🔔 Notificações',
      description: 'Fique por dentro de tudo que acontece na plataforma em tempo real.',
    },
    {
      selector: '[data-tour="profile"]',
      title: '👤 Seu Perfil',
      description: 'Gerencie sua foto, nome e preferências. Você também pode reativar este tour aqui!',
    },
  ],

  // ── Técnico ───────────────────────────────────────────────────────────────
  technician: [
    {
      selector: '[data-tour="chamados-app"]',
      title: '🎫 Chamados',
      description: 'Visualize e gerencie todos os chamados de suporte abertos para você.',
      interactive: true,
    },
    {
      selector: '[data-tour="pccare-app"]',
      title: '💻 PC Care',
      description: 'Registre e acompanhe manutenções de equipamentos.',
    },
    {
      selector: '[data-tour="profile"]',
      title: '👤 Seu Perfil',
      description: 'Gerencie sua foto, nome e preferências. Você também pode reativar este tour aqui!',
    },
  ],

  // ── Usuário genérico ──────────────────────────────────────────────────────
  user: [
    {
      selector: '[data-tour="apps-grid"]',
      title: '📱 Seus Apps',
      description: 'Todos os aplicativos que você tem acesso aparecem aqui. Clique para abrir um.',
      interactive: true,
    },
    {
      selector: '[data-tour="notifications"]',
      title: '🔔 Notificações',
      description: 'Avisos importantes sobre o laboratório e seus aplicativos chegam aqui.',
    },
    {
      selector: '[data-tour="profile"]',
      title: '👤 Seu Perfil',
      description: 'Gerencie sua foto, nome e preferências. Você também pode reativar este tour aqui!',
    },
  ],
}

// Fallback caso o roleId não tenha passos mapeados
export const defaultSteps: TourStep[] = roleBasedSteps['user']
