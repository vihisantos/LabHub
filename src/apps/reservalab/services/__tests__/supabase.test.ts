import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TabletReserva } from '../../types'

/**
 * Hoisted mocks: o builder simula o encadeamento do Supabase.
 * Cada método retorna o próprio builder (mockReturnThis).
 * `then` torna o builder "thenable" para o `await` funcionar.
 */
const { mockCreateClient, mockFrom, mockQueryBuilder, mockAuthGetSession } = vi.hoisted(() => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [] })),
  }
  const mockFrom = vi.fn().mockReturnValue(mockQueryBuilder)
  const mockAuthGetSession = vi.fn(async () => ({ data: { session: null } }))
  const mockCreateClient = vi.fn(() => ({
    from: mockFrom,
    auth: { getSession: mockAuthGetSession },
  }))
  return { mockCreateClient, mockFrom, mockQueryBuilder, mockAuthGetSession }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

vi.mock('../../../../lib/supabase', () => ({
  defaultDb: { auth: { getSession: mockAuthGetSession } },
}))

vi.mock('../../../../core/workspaces/store', () => ({
  workspaceStore: {
    activeWorkspaceId: 'ws-test-reservalab',
    filter: <T,>(rows: T[]) => rows,
  },
}))

const mockTablets: TabletReserva[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    sala: 'Sala 101',
    quantidade_tablets: 10,
    professor: 'João',
    horario_inicio: '2026-06-25T08:00:00.000Z',
    horario_fim: '2026-06-25T10:00:00.000Z',
    finalidade: 'Aula prática',
    reservado_por: 'Maria',
    status: 'ativa',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    sala: 'Sala 202',
    quantidade_tablets: 5,
    professor: 'Ana',
    horario_inicio: '2026-06-25T14:00:00.000Z',
    horario_fim: '2026-06-25T16:00:00.000Z',
    finalidade: 'Prova',
    reservado_por: 'Carlos',
    status: 'ativa',
  },
]

describe('supabase service', () => {
  describe('com Supabase configurado', () => {
    let supabaseModule: typeof import('../supabase')

    beforeEach(async () => {
      vi.clearAllMocks()
      // Reset then default
      mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [] }))

      vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
      vi.resetModules()
      supabaseModule = await import('../supabase')
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    describe('cliente Supabase', () => {
      it('cria cliente com as credenciais do ambiente', () => {
        expect(mockCreateClient).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-anon-key',
        )
      })

      it('exporta o cliente (não é null)', () => {
        expect(supabaseModule.supabase).not.toBeNull()
      })
    })

    describe('fetchTabletReservas', () => {
      it('retorna reservas quando Supabase retorna dados', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ data: mockTablets }))

        const result = await supabaseModule.fetchTabletReservas()

        expect(result).toEqual(mockTablets)
        expect(mockFrom).toHaveBeenCalledWith('tablet_reservations')
        expect(mockQueryBuilder.select).toHaveBeenCalledWith('*')
        expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', 'ativa')
        expect(mockQueryBuilder.order).toHaveBeenCalledWith('horario_inicio', { ascending: true })
      })

      it('aplica filtros de data corretos', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [] }))
        const desde = new Date('2026-06-01T00:00:00')
        const ate = new Date('2026-07-01T00:00:00')

        await supabaseModule.fetchTabletReservas(desde, ate)

        const desdeEsperado = new Date('2026-06-01T00:00:00')
        desdeEsperado.setHours(0, 0, 0, 0)
        expect(mockQueryBuilder.gte).toHaveBeenCalledWith('horario_inicio', desdeEsperado.toISOString())

        const ateEsperado = new Date('2026-07-01T00:00:00')
        expect(mockQueryBuilder.lt).toHaveBeenCalledWith('horario_inicio', ateEsperado.toISOString())
      })

      it('usa data atual como padrão quando nenhum parâmetro é passado', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [] }))

        await supabaseModule.fetchTabletReservas()

        expect(mockQueryBuilder.gte).toHaveBeenCalled()
        expect(mockQueryBuilder.lt).toHaveBeenCalled()
      })

      it('retorna array vazio quando data é null', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ data: null }))

        const result = await supabaseModule.fetchTabletReservas()
        expect(result).toEqual([])
      })
    })

    describe('createTabletReserva', () => {
      it('insere reserva na tabela tablet_reservations', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ error: null }))
        const values = {
          sala: 'Sala 303',
          quantidade_tablets: 8,
          professor: 'Pedro',
          horario_inicio: '2026-06-26T08:00:00.000Z',
          horario_fim: '2026-06-26T10:00:00.000Z',
          finalidade: 'Aula',
          reservado_por: 'Joana',
          status: 'ativa',
        }

        await supabaseModule.createTabletReserva(values)

        expect(mockFrom).toHaveBeenCalledWith('tablet_reservations')
        expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
          ...values,
          workspace_id: 'ws-test-reservalab',
          created_at: expect.any(String),
        })
      })
    })

    describe('updateTabletReserva', () => {
      it('atualiza reserva na tabela com id específico', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ error: null }))
        const values = { sala: 'Sala 404', professor: 'Novo Professor' }

        await supabaseModule.updateTabletReserva('11111111-1111-4111-8111-111111111111', values)

        expect(mockFrom).toHaveBeenCalledWith('tablet_reservations')
        expect(mockQueryBuilder.update).toHaveBeenCalledWith(values)
        expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111')
      })
    })

    describe('deleteTabletReserva', () => {
      it('cancela a reserva (soft delete) com status cancelada para o id específico', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ error: null }))

        await supabaseModule.deleteTabletReserva('55555555-5555-4555-8555-555555555555')

        expect(mockFrom).toHaveBeenCalledWith('tablet_reservations')
        expect(mockQueryBuilder.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'cancelada',
            cancelled_at: expect.any(String),
          }),
        )
        expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', '55555555-5555-4555-8555-555555555555')
      })
    })

    describe('cleanupOldCancelledTablets', () => {
      it('deleta reservas canceladas com mais de 1 mês (30 dias)', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ error: null }))

        await supabaseModule.cleanupOldCancelledTablets()

        expect(mockFrom).toHaveBeenCalledWith('tablet_reservations')
        expect(mockQueryBuilder.delete).toHaveBeenCalled()
        expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', 'cancelada')
        expect(mockQueryBuilder.lt).toHaveBeenCalledWith('horario_inicio', expect.any(String))
      })
    })

    describe('checkTabletCapacity', () => {
      it('retorna null quando a soma de tablets não ultrapassa o inventário', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) =>
          resolve({ data: [{ id: 'a', quantidade_tablets: 20 }, { id: 'b', quantidade_tablets: 15 }] }))

        const err = await supabaseModule.checkTabletCapacity({
          inicio: new Date('2026-06-25T08:00:00Z'),
          fim: new Date('2026-06-25T10:00:00Z'),
          quantidade: 10,
        })

        expect(err).toBeNull()
      })

      it('retorna mensagem de erro quando ultrapassa o inventário (50)', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) =>
          resolve({ data: [{ id: 'a', quantidade_tablets: 30 }, { id: 'b', quantidade_tablets: 15 }] }))

        const err = await supabaseModule.checkTabletCapacity({
          inicio: new Date('2026-06-25T08:00:00Z'),
          fim: new Date('2026-06-25T10:00:00Z'),
          quantidade: 10,
        })

        expect(err).toContain('Capacidade excedida')
        expect(err).toContain('45')
      })

      it('ignora a própria reserva na edição (ignoreId)', async () => {
        mockQueryBuilder.then.mockImplementation((resolve: (v: unknown) => void) =>
          resolve({ data: [{ id: 'minha-reserva', quantidade_tablets: 45 }, { id: 'outra', quantidade_tablets: 3 }] }))

        const err = await supabaseModule.checkTabletCapacity({
          inicio: new Date('2026-06-25T08:00:00Z'),
          fim: new Date('2026-06-25T10:00:00Z'),
          quantidade: 5,
          ignoreId: 'minha-reserva',
        })

        // 3 (outra) + 5 (nova qtd) = 8 <= 50 → ok
        expect(err).toBeNull()
      })
    })
  })

  describe('sem Supabase configurado (env vars vazias)', () => {
    let supabaseModule: typeof import('../supabase')

    beforeEach(async () => {
      vi.clearAllMocks()
      vi.stubEnv('VITE_SUPABASE_URL', '')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
      vi.resetModules()
      supabaseModule = await import('../supabase')
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('supabase é null', () => {
      expect(supabaseModule.supabase).toBeNull()
    })

    it('fetchTabletReservas retorna array vazio sem chamar Supabase', async () => {
      const result = await supabaseModule.fetchTabletReservas()
      expect(result).toEqual([])
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('createTabletReserva não chama Supabase', async () => {
      await supabaseModule.createTabletReserva({ sala: 'teste' })
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('updateTabletReserva não chama Supabase', async () => {
      await supabaseModule.updateTabletReserva('11111111-1111-4111-8111-111111111111', {})
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('deleteTabletReserva não chama Supabase', async () => {
      await supabaseModule.deleteTabletReserva('11111111-1111-4111-8111-111111111111')
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('cleanupOldCancelledTablets não chama Supabase', async () => {
      await supabaseModule.cleanupOldCancelledTablets()
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })
})
