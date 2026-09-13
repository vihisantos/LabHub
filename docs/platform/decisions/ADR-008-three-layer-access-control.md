# ADR-008 — Controle de acesso em três camadas

## Status

Aceita (substituída pelo RBAC 2.0 no enforcement de backend)

> **Nota:** o RBAC 2.0 (migration 036) introduz autorização por Action no backend. O modelo de três camadas é preservado como fallback quando `RBAC_2_ENABLED=0`. Consulte o [índice do RBAC 2.0](../rbac/README.md) para o modelo vigente.

## Contexto

O LabHub precisa controlar o acesso às aplicações em vários níveis:

- Um campus pode não usar todas as aplicações (por exemplo, não usar a TV)
- Um usuário pode ter permissões diferentes por aplicação
- As camadas precisam ser aplicadas de forma consistente

## Decisão

Implementar controle de acesso em três camadas, verificadas nesta ordem:

1. **Nível de workspace** — a aplicação está habilitada? (`disabled_apps`)
2. **Nível de usuário** — o usuário tem permissão? (`app_access` / `role`)
3. **Acesso concedido** — a aplicação fica disponível

**A desativação no workspace sempre prevalece.** Um usuário com acesso `full` não consegue usar uma aplicação desativada no workspace.

- Enforcement no backend: `require_module()` nos endpoints Flask
- Enforcement no frontend: `isModuleAvailable()` e o componente `AppGuard`

## Alternativas consideradas

1. **Acesso apenas por cargo** — não trata a disponibilidade da aplicação por workspace
2. **Acesso apenas por workspace** — não trata permissões individuais
3. **Verificação combinada única** — dificulta identificar qual camada negou o acesso

## Consequências

### Positivas

- Controle de acesso claro e auditável
- O admin do workspace controla a disponibilidade das aplicações
- Overrides por usuário são possíveis
- Enforcement consistente entre frontend e backend

### Negativas

- As três camadas aumentam a complexidade de depuração de permissões
- `disabled_apps` e `app_access` precisam ser mantidos coerentes entre si

## Relacionados

- `src/core/auth/AppGuard.tsx`
- `src/core/workspaces/apps.ts`
- `src/core/permissions/service.ts`
- [Autorização](../security/authorization.md)
