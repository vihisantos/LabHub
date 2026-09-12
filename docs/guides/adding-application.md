# Criar uma nova aplicação

> Passo a passo para adicionar uma aplicação ao LabHub.

## Pré-requisitos

- Entender a estrutura das aplicações existentes
- Conhecer a camada de dados (`localStorage` + sincronização)

## Passo 1 — Criar o diretório

```text
src/apps/<nome-da-aplicacao>/
├── index.tsx              # Definição de rotas
├── layouts/
│   └── <Nome>Layout.tsx   # Layout com navegação
├── pages/
│   ├── Dashboard.tsx      # Painel principal
│   └── __tests__/
├── components/
├── hooks/
├── services/
├── types/
└── utils/
```

## Passo 2 — Definir as rotas

```typescript
// src/apps/<nome-da-aplicacao>/index.tsx
import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'

const Dashboard = lazy(() => import('./pages/Dashboard'))

export function <Nome>App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
    </Routes>
  )
}
```

## Passo 3 — Criar o layout

```typescript
// src/apps/<nome-da-aplicacao>/layouts/<Nome>Layout.tsx
import { ThemeProvider } from '../../../lib/ThemeContext'

export function <Nome>Layout({ children }) {
  return (
    <ThemeProvider storageKey="<nome>_theme" defaultTheme="dark">
      <div className="flex min-h-dvh flex-col bg-surface">
        {/* Navegação */}
        <main className="flex-1 p-4">{children}</main>
      </div>
    </ThemeProvider>
  )
}
```

## Passo 4 — Registrar no roteador

```typescript
// src/App.tsx
const <Nome>App = lazy(() =>
  import('./apps/<nome-da-aplicacao>').then(m => ({ default: m.<Nome>App }))
)

<Route path="/<nome-da-aplicacao>/*" element={
  <AuthGuard>
    <AppGuard module="<nome-da-aplicacao>">
      <<Nome>App />
    </AppGuard>
  </AuthGuard>
} />
```

## Passo 5 — Registrar no catálogo de aplicações

```typescript
// src/appRegistry.ts
{
  id: '<nome-da-aplicacao>',
  name: 'Nome da Aplicação',
  icon: icons.ui.<icone>,
  color: '#hexadecimal',
  route: '/<nome-da-aplicacao>',
  description: 'O que esta aplicação faz',
}
```

Se a aplicação aceitar configuração por workspace, declare também `configurable`, `settings` e `SettingsPanel`. Veja [Administração de workspaces](../platform/architecture/workspaces-admin.md).

## Passo 6 — Criar a camada de serviço

```typescript
// src/apps/<nome-da-aplicacao>/services/<nome>Service.ts
import { createSyncService } from '../../../lib/sync'
import type { <Nome>Type } from '../types'

export const <nome>Service = createSyncService<<Nome>Type>('<colecao>')
```

## Passo 7 — Disponibilizar nos workspaces

Atualize `src/core/workspaces/apps.ts` para incluir a nova aplicação na lista de aplicações disponíveis.

## Passo 8 — Escrever testes

Crie os testes em `src/apps/<nome-da-aplicacao>/pages/__tests__/`.

## Passo 9 — Documentar

Crie `docs/apps/<nome-da-aplicacao>/README.md` respondendo:

- O que é esta aplicação?
- Para quem ela serve?
- O que ela faz?
- Onde está sua documentação?
- Quais integrações e dependências ela tem?

Subpastas adicionais (`architecture/`, `guides/`, `reference/`, `audits/`) entram apenas quando houver conteúdo que as justifique.

## Regras de isolamento

- **Não** importe código de outras aplicações (`src/apps/outra-aplicacao/`)
- **Use** `core/` e `lib/` para funcionalidade compartilhada
- **Use** `createSyncService()` para dados com tabela remota
- **Crie** um `ThemeProvider` com `storageKey` exclusivo

## Relacionados

- [Desenvolvimento](development.md)
- [Conceitos: Aplicações](../platform/concepts/applications.md)
- [Migrations do banco](database-migrations.md)
