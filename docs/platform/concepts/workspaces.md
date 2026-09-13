# Workspaces

> O que são workspaces e por que o multi-tenancy importa?

## O que é

Um **workspace** representa um campus ou unidade organizacional. Ele agrupa usuários, aplicações habilitadas e todos os dados. Cada dado do LabHub pertence a um workspace.

## Por que existe

Departamentos de TI universitários atendem vários campi. O workspace isola os dados por unidade, de modo que cada local veja apenas seus próprios ativos, chamados e reservas.

## Como funciona

Cada workspace possui:

- **`name`** e **`slug`** (por exemplo, "Anhembi Morumbi" → `anhembimorumbi`)
- **`disabled_apps`** — lista de identificadores de aplicações desativadas naquele campus
- **`spreadsheet_url`** — link da planilha usada pelo ReservaLab
- **`lab_count`** — quantidade de laboratórios exibidos (padrão 2)

Os usuários pertencem a workspaces por meio de `memberships` (modelo RBAC 2.0) e, no modelo legado, por meio de `profiles.workspace_ids`.

## Isolamento de dados

O isolamento acontece em três níveis:

1. **Banco (RLS)** — políticas de Row Level Security filtram linhas com `user_belongs_to_workspace(workspace_id)` e bypass para `is_super_admin()`
2. **Frontend (filtro)** — `workspaceStore.filter()` aplica o filtro de workspace sobre os dados locais
3. **API (backend)** — o backend valida a participação do usuário no workspace antes de operar

## Disponibilidade de aplicações

Um workspace habilita ou desabilita aplicações de forma independente:

```typescript
// Aplicações desativadas neste campus
workspace.disabled_apps = ['tv', 'stock']
```

A verificação de disponibilidade tem três camadas:

1. **Workspace** — a aplicação está habilitada? (`disabled_apps`)
2. **Usuário** — o usuário tem permissão? (`app_access` / role)
3. **Acesso concedido** — a aplicação fica disponível

**Importante:** a desativação no workspace sempre prevalece. Um usuário com acesso `full` a uma aplicação não consegue usá-la se ela estiver desativada no workspace.

## Relacionados

- [Visão geral do sistema](system-overview.md)
- [Autorização](../security/authorization.md)
- [Administração de workspaces](../architecture/workspaces-admin.md)
- [Aplicações](applications.md)
