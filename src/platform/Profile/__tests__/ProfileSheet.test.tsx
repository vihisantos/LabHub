import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mockUpdateProfile = vi.hoisted(() => vi.fn())
const mockSignOut = vi.hoisted(() => vi.fn())
const mockNavigate = vi.hoisted(() => vi.fn())
const mockThemeApply = vi.hoisted(() => vi.fn())
const mockUser = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))

vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }))

vi.mock('../../../core/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.current, signOut: mockSignOut }),
}))

vi.mock('../../../core/auth/service', () => ({
  authService: { updateProfile: mockUpdateProfile },
}))

vi.mock('../../../core/theme/store', () => ({
  themeStore: {
    apply: mockThemeApply,
    previewAccent: vi.fn(),
    resetAccent: vi.fn(),
  },
}))

vi.mock('../../../core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: { id: 'ws-1', name: 'Lab Central', location: 'Bloco A', color: '#6366f1', disabled_apps: [] },
    assignedWorkspaces: [],
  }),
}))

vi.mock('../../../lib/usePushNotifications', () => ({
  usePushNotifications: vi.fn(() => ({
    supported: true,
    permission: 'granted',
    subscribed: true,
    loading: false,
    error: null,
    subscribe: vi.fn(),
  })),
}))

vi.mock('../../../lib/cloudinary', () => ({
  uploadAvatarToCloudinary: vi.fn(async () => 'https://cdn/avatar.png'),
  uploadBannerToCloudinary: vi.fn(async () => 'https://cdn/banner.png'),
}))

vi.mock('../../../lib/supabase', () => ({ defaultDb: null }))

import { ProfileSheet } from '../ProfileSheet'

function baseUser(over: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    name: 'Vitor Santos',
    email: 'vitor@labhub.app',
    roleId: 'role-technician',
    status: 'active',
    is_super_admin: false,
    workspace_ids: ['ws-1'],
    accent: 'blue',
    theme_variant: 'dim',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function renderSheet() {
  return render(<ProfileSheet open onClose={() => {}} />)
}

/** Entra no modo de edição e limpa o rascunho, para os testes de salvamento. */
function abrirEdicao() {
  fireEvent.click(screen.getByRole('button', { name: 'Alterar perfil' }))
}

/**
 * Deixa as promessas do onClick resolverem.
 * O setup global liga `vi.useFakeTimers()` (src/test/mocks.ts:63), e o
 * `waitFor` do Testing Library gira contra os timers falsos. É o mesmo motivo
 * de ProfileSheetPushTest usar `act` em vez de `waitFor`.
 */
async function settle() {
  await act(async () => {})
}

beforeEach(() => {
  mockUser.current = baseUser()
  mockUpdateProfile.mockResolvedValue({})
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProfileSheet — leitura por padrão, edição só quando pedida', () => {
  it('não mostra os campos de edição nem os botões de foto/banner', () => {
    renderSheet()
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('E-mail institucional')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alterar foto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alterar banner' })).not.toBeInTheDocument()
  })

  it('mostra o botão "Alterar perfil", e é ele que abre os campos', () => {
    renderSheet()
    abrirEdicao()
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail institucional')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alterar foto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alterar banner' })).toBeInTheDocument()
  })

  it('Cancelar volta para a leitura e não grava nada', () => {
    renderSheet()
    abrirEdicao()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Outro Nome' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(mockUpdateProfile).not.toHaveBeenCalled()
    expect(screen.getByText('Vitor Santos')).toBeInTheDocument()
  })

  it('reabrir a edição não ressuscita o rascunho descartado', () => {
    renderSheet()
    abrirEdicao()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Rascunho' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    abrirEdicao()
    // Sem o reset, o campo abriria com 'Rascunho' e o botão Salvar já marcado
    // como alterado, com a tela em modo de edição sem ninguém ter pedido.
    expect(screen.getByLabelText('Nome')).toHaveValue('Vitor Santos')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })
})

describe('ProfileSheet — e-mail institucional é campo separado do da conta', () => {
  it('sem institutionalEmail, diz que não foi informado em vez de mostrar o @labhub', () => {
    renderSheet()
    expect(screen.getByText('E-mail institucional não informado')).toBeInTheDocument()
    // O e-mail da conta continua visível, mas como o que é: onde se entra.
    expect(screen.getByText('vitor@labhub.app')).toBeInTheDocument()
  })

  it('com institutionalEmail, mostra o institucional e mantém o da conta como 2ª linha', () => {
    mockUser.current = baseUser({ institutionalEmail: 'vitor@univ.edu' })
    renderSheet()
    expect(screen.getByText('vitor@univ.edu')).toBeInTheDocument()
    expect(screen.getByText('vitor@labhub.app')).toBeInTheDocument()
  })

  it('não repete a mesma linha quando institucional e da conta coincidem', () => {
    mockUser.current = baseUser({ institutionalEmail: 'vitor@labhub.app' })
    renderSheet()
    expect(screen.getAllByText('vitor@labhub.app')).toHaveLength(1)
  })

  it('salva o institucional sem tocar no e-mail da conta', async () => {
    renderSheet()
    abrirEdicao()
    fireEvent.change(screen.getByLabelText('E-mail institucional'), {
      target: { value: 'vitor@univ.edu' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await settle()
    // `email` fora da chamada: sobrescrevê-lo desincronizaria o profile do
    // auth.users e quebraria a busca de conta do admin.
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      name: 'Vitor Santos',
      institutionalEmail: 'vitor@univ.edu',
    })
  })

  it('limpar o campo grava null, não string vazia', async () => {
    mockUser.current = baseUser({ institutionalEmail: 'vitor@univ.edu' })
    renderSheet()
    abrirEdicao()
    fireEvent.change(screen.getByLabelText('E-mail institucional'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await settle()
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      name: 'Vitor Santos',
      institutionalEmail: null,
    })
  })

  it('recusa e-mail institucional inválido e não grava', async () => {
    renderSheet()
    abrirEdicao()
    fireEvent.change(screen.getByLabelText('E-mail institucional'), {
      target: { value: 'nao-e-email' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await settle()
    expect(screen.getByText('E-mail institucional inválido')).toBeInTheDocument()
    expect(mockUpdateProfile).not.toHaveBeenCalled()
  })

  it('recusa nome vazio', async () => {
    renderSheet()
    abrirEdicao()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await settle()
    expect(screen.getByText('O nome não pode ficar vazio')).toBeInTheDocument()
    expect(mockUpdateProfile).not.toHaveBeenCalled()
  })

  it('Salvar começa desabilitado e só habilita com alteração real', () => {
    renderSheet()
    abrirEdicao()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    // Só espaços não contam como alteração: trimmed() é o mesmo valor.
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Vitor Santos ' } })
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Vitor S.' } })
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })
})

describe('ProfileSheet — seções', () => {
  it('Agrupa em Aparência, Conta e Administração, e o Sair fica por último', () => {
    mockUser.current = baseUser({ is_super_admin: true })
    renderSheet()
    const titulos = ['Aparência', 'Conta', 'Administração']
    for (const t of titulos) expect(screen.getByText(t)).toBeInTheDocument()

    // Sair da conta é a última coisa focável da folha.
    const botoes = screen.getAllByRole('button')
    expect(botoes[botoes.length - 1]).toHaveAttribute('id', 'btn-logout')
  })

  it('esconde a seção de Administração para quem não é super admin', () => {
    renderSheet()
    expect(screen.queryByText('Administração')).not.toBeInTheDocument()
    expect(screen.queryByText('Configurações do Admin')).not.toBeInTheDocument()
  })

  it('Cor de destaque e Tema ficam no mesmo card de Aparência', () => {
    renderSheet()
    const destaque = screen.getByText('Cor de destaque')
    const tema = screen.getByText('Tema')
    // Mesmo ancestral de card = uma decisão de aparência só.
    const card = destaque.closest('div.rounded-xl')
    expect(card).not.toBeNull()
    expect(card).toContainElement(tema)
  })
})

describe('ProfileSheet — acessibilidade e alvos de toque', () => {
  it('todo botão do CONTEÚDO tem pelo menos 44px de altura', () => {
    mockUser.current = baseUser({ is_super_admin: true })
    renderSheet()
    abrirEdicao()
    // Só o conteúdo da folha. O botão de fechar vem do BottomSheet, que é
    // compartilhado por todas as folhas: mexer nele é outra mudança, com
    // outro alcance. Aqui o alvo mínimo é do que este arquivo controla.
    const conteudo = within(screen.getByTestId('perfil-conteudo'))
    const botoes = conteudo.getAllByRole('button')
    expect(botoes.length).toBeGreaterThan(5)
    for (const b of botoes) {
      const cls = b.className
      expect(
        /min-h-11|\bh-11\b/.test(cls),
        `alvo pequeno: "${b.textContent?.trim().slice(0, 30) || b.getAttribute('aria-label')}" -> ${cls}`,
      ).toBe(true)
    }
  })

  it('os botões de foto e banner têm nome acessível (não só title)', () => {
    renderSheet()
    abrirEdicao()
    expect(screen.getByRole('button', { name: 'Alterar foto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alterar banner' })).toBeInTheDocument()
  })

  it('as escolhas de tema e accent anunciam o estado marcado', () => {
    renderSheet()
    // dim + blue são os valores do usuário de teste.
    expect(screen.getByRole('button', { name: 'Sutil' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Escuro' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Azul' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Roxo' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('ProfileSheet — o seletor de cor de destaque', () => {
  it('é só a amostra: nenhuma cor do accent vira texto', () => {
    renderSheet()
    // Antes cada opção era um botão com fundo accent+15 e TEXTO na cor do
    // accent, o que dava 1.92:1 a 3.59:1 no Sutil. A cor agora é a amostra
    // sólida e não há texto algum para contrastar.
    const rotulos = screen.getAllByRole('button', { name: /Azul|Esmeralda|Ciano|Roxo/ })
    expect(rotulos).toHaveLength(4)
    for (const b of rotulos) {
      expect(b.className).not.toMatch(/text-\[|text-(?:xs|sm|base|md|lg)/)
      expect(b).toHaveTextContent('')
    }
  })

  it('cada amostra é um círculo de 44px com a cor do accent', () => {
    renderSheet()
    for (const [nome, cor] of [
      ['Azul', '#3b82f6'],
      ['Esmeralda', '#10b981'],
      ['Ciano', '#06b6d4'],
      ['Roxo', '#a855f7'],
    ] as const) {
      const b = screen.getByRole('button', { name: nome })
      expect(b.className, nome).toMatch(/rounded-full/)
      expect(b.className, nome).toMatch(/h-11 w-11/)
      expect(b.style.backgroundColor).toBeTruthy()
      expect(cor).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('a amostra escolhida é a única com anel', () => {
    renderSheet()
    const azul = screen.getByRole('button', { name: 'Azul' })
    const roxo = screen.getByRole('button', { name: 'Roxo' })
    expect(azul.className).toMatch(/ring-2 ring-fg ring-offset-2/)
    expect(roxo.className).not.toMatch(/ring-2/)
  })

  it('não usa opacity-60 para desligar as não escolhidas', () => {
    renderSheet()
    // Esmaecer o não-escolhido era o que derrubava o texto a 1.5:1-3.1:1.
    for (const nome of ['Azul', 'Esmeralda', 'Ciano', 'Roxo']) {
      expect(screen.getByRole('button', { name: nome }).className, nome).not.toMatch(/opacity-\d/)
    }
  })

  it('o nome da cor continua acessível e no hover', () => {
    renderSheet()
    const azul = screen.getByRole('button', { name: 'Azul' })
    expect(azul).toHaveAttribute('aria-label', 'Azul')
    expect(azul).toHaveAttribute('title', 'Azul')
  })
})

describe('ProfileSheet — as cores fixas foram trocadas por tokens', () => {
  function source(): string {
    return readFileSync(resolve(__dirname, '../ProfileSheet.tsx'), 'utf8')
  }

  /** Cores de DADO (amostras de accent, estados de push) são literais de propósito. */
  const coresDeEstado = ['emerald-500', 'amber-500', 'red-500', 'emerald-600', 'amber-600', 'red-600']

  it('não sobrou roxo/azul fixo de cromo', () => {
    const semEstado = source()
      .split('\n')
      .filter((l) => !coresDeEstado.some((c) => l.includes(c)))
      .join('\n')
    // purple-500 era o tile do Admin; text-blue-500 era o "Trocar" do
    // workspace — os dois decorativos e conflitantes com o accent escolhido.
    expect(semEstado).not.toMatch(/purple-\d00|blue-\d00/)
  })

  it('o botão Salvar usa --accent-strong, que passa de 4.5:1 com branco', () => {
    expect(source()).toContain('var(--accent-strong)')
    // Não pode voltar a ser um fundo SÓLIDO em `accent`: branco sobre o accent
    // puro dá 2.43:1 (ciano) a 3.97:1 (roxo) e reprova nos quatro. O tema
    // ativo continua usando accent com alfa, que é fundo de destaque, não
    // fundo de texto — por isso a exceção explícita abaixo.
    expect(source()).not.toMatch(/backgroundColor:\s*accent\s*\}\}/)
    expect(source()).toMatch(/backgroundColor:\s*accent\s*\+\s*'1a'/)
  })

  it('"Trocar" do workspace não é mais azul fixo', () => {
    expect(source()).toContain('text-fg-muted">Trocar')
  })
})
