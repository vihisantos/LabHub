# Autenticação

> Como o LabHub autentica usuários?

## Visão geral

O LabHub usa o Supabase Auth. Os usuários se cadastram com e-mail e senha, e o perfil correspondente é armazenado na tabela `profiles`.

## Fluxo de autenticação

```mermaid
flowchart TD
    A[Usuário abre a aplicação] --> B{Está autenticado?}
    B -->|Não| C[Tela de login]
    B -->|Sim| D[Carrega o perfil]
    C --> E[Supabase Auth]
    E --> F{Status da conta}
    F -->|active| D
    F -->|pending| G[Tela de aprovação pendente]
    F -->|rejeitado| H[Conta rejeitada]
    D --> I[Carrega o acesso a workspaces]
    I --> J[Encaminha para a aplicação]
```

## Ciclo de vida do usuário

1. **Cadastro** — o perfil é criado com `status: 'pending'`
2. **Admin notificado** — notificação push com ações de aprovar ou recusar
3. **Admin aprova** — o status muda para `'active'` e o cargo é atribuído
4. **Usuário entra** — passa a ter acesso às aplicações permitidas

Um usuário com status `pending` não tem acesso ao sistema até a aprovação.

## Estrutura do perfil

```typescript
interface Profile {
  id: string          // = auth.users.id
  email: string
  name: string
  role: 'viewer' | 'technician' | 'admin'
  status: 'active' | 'pending'
  is_super_admin: boolean
  workspace_ids: string[]
  app_access: Record<string, 'full' | 'read' | 'none'>
  notify_settings: Record<string, boolean>
  avatar: string
  banner: string
}
```

## Contexto de autenticação (`src/core/auth/AuthContext.tsx`)

Disponibiliza:

- `user` — usuário autenticado
- `profile` — perfil carregado de `profiles`
- `loading` — estado de carregamento da autenticação
- `signIn()` / `signUp()` / `signOut()`
- `isSuperAdmin` — verificação de super admin

## Guards

| Guard | Propósito |
|-------|-----------|
| `AuthGuard` | Exige usuário autenticado |
| `AdminGuard` | Exige `is_super_admin` (capacidade de plataforma global). Não existe mais "admin por workspace" no backend — apenas Super Admin |
| `AppGuard` | Verifica o acesso à aplicação (habilitada no workspace e permitida ao usuário) |

## Modelo de autorização (contexto)

A autenticação acima (Supabase Auth + perfil `pending`/`active`) segue valendo para identificar o usuário. A **autorização** do que cada usuário pode fazer, no entanto, é controlada pelo **RBAC 2.0**:

- Camada autoritativa do backend, **sempre ativa** (ON-only, deny-by-default)
- Autorização granular por **Action** resolvida contra a `membership` do usuário no workspace
- Super Admin (`profiles.is_super_admin`) é capacidade de plataforma global, não uma role de workspace
- O modelo legado (`profiles.role` + `app_access`) **não autoriza mais nada no backend** — serve apenas para compatibilidade de frontend

## Relacionados

- [Autorização](authorization.md) — camadas de controle, RBAC 2.0, roles e Actions
- [Workspaces](../concepts/workspaces.md) — modelo de multi-tenancy e isolamento
- [Referência da API](../../reference/api.md)
