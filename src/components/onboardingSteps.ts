// Mapping of user roles to onboarding steps
// Adjust selectors, titles and descriptions to match your UI
export type TourStep = {
  selector: string;
  title: string;
  description: string;
};

export const roleBasedSteps: Record<string, TourStep[]> = {
  // Admin role – may have access to admin app
  admin: [
    { selector: '#adminDashboard', title: 'Admin Dashboard', description: 'Painel de controle para administradores.' },
    { selector: '#userManagement', title: 'Gerenciar Usuários', description: 'Adicione, edite ou remova usuários da plataforma.' }
  ],
  // Technician role – acesso ao app de chamados
  technician: [
    { selector: '#chamadosApp', title: 'Chamados', description: 'Abra e gerencie chamados de suporte.' },
    { selector: '#newTicketButton', title: 'Novo Chamado', description: 'Crie um novo chamado rapidamente.' }
  ],
  // Generic user – home page features
  user: [
    { selector: '#menuButton', title: 'Menu', description: 'Clique aqui para abrir o menu principal.' },
    { selector: '.searchInput', title: 'Busca', description: 'Digite aqui o que deseja procurar.' },
    { selector: '.profileLink', title: 'Perfil', description: 'Acesse seu perfil e configurações.' }
  ]
};

// Fallback steps if role is unknown
export const defaultSteps: TourStep[] = roleBasedSteps['user'];
