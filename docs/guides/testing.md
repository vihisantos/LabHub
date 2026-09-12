# Testes

> Como escrever e executar testes no LabHub.

## Stack de testes

- **Vitest** — executor de testes
- **Testing Library** — utilitários de teste de componentes
- **jsdom** — simulação do ambiente de navegador

## Executar

```bash
npm test                 # modo watch
npm run test:run         # execução única
npm run test:coverage    # com relatório de cobertura
```

## Estrutura dos testes

Os testes ficam em diretórios `__tests__/` próximos ao código testado:

```text
src/apps/chamados/pages/
├── TicketDetail.tsx
└── __tests__/
    ├── TicketDetail.test.tsx
    └── TicketDetailRealtime.test.tsx
```

## Escrevendo testes

### Teste básico de componente

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MyComponent } from '../MyComponent'

// Mock de dependências
vi.mock('../../hooks/useData', () => ({
  useData: () => ({
    data: mockData,
    loading: false,
  }),
}))

describe('MyComponent', () => {
  it('renderiza corretamente', () => {
    render(<MyComponent />)
    expect(screen.getByText('Texto esperado')).toBeDefined()
  })
})
```

### Padrões de mock

```typescript
// Mock de um hook
vi.mock('../../hooks/useTickets', () => ({
  useTickets: () => ({
    tickets: [TICKET],
    update: mockUpdate,
    updateStatus: mockUpdateStatus,
  }),
}))

// Mock do react-router-dom
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'ticket-1' }),
  useNavigate: () => mockNavigate,
}))

// Mock do Supabase
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))
```

### Testando comportamento assíncrono

```typescript
import { waitFor } from '@testing-library/react'

it('carrega os dados', async () => {
  render(<MyComponent />)
  await waitFor(() => {
    expect(screen.getByText('Conteúdo carregado')).toBeDefined()
  })
})
```

> **Nota:** `getByDisplayValue` não normaliza o matcher na Testing Library. Use expressão regular ou função.

## Helpers de teste

Em `src/test/`:

- `helpers.tsx` — render personalizado com provedores
- `mocks.ts` — dados de mock compartilhados
- `setup.ts` — configuração do ambiente de testes

## Testes de backend (Python)

```bash
cd api && python -m pytest tests/ -q
```

Testes dos endpoints da API Flask e das migrations.

## Relacionados

- [Desenvolvimento](development.md)
- [Configuração do ambiente](setup.md)
