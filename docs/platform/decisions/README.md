# Decisões arquiteturais (ADRs)

> Decisões que moldaram a arquitetura do LabHub.

## Sobre ADRs

Um *Architecture Decision Record* registra uma decisão arquitetural relevante, junto com o contexto em que foi tomada e suas consequências.

## Formato

Cada ADR segue este modelo:

```markdown
# ADR-NNN — Título

## Status
Proposta | Aceita | Substituída | Obsoleta

## Contexto
Que problema existia?

## Decisão
O que foi decidido?

## Alternativas consideradas
Que outras opções foram avaliadas?

## Consequências
### Positivas
- ...

### Negativas
- ...

## Relacionados
Links para código, documentação e PRs.
```

## Índice

| ADR | Título | Status |
|-----|--------|--------|
| [ADR-001](ADR-001-offline-first-architecture.md) | Offline-first com localStorage | Aceita |
| [ADR-002](ADR-002-supabase-as-remote-database.md) | Supabase como banco remoto | Aceita |
| [ADR-003](ADR-003-flask-api-for-chamados.md) | API Flask para o Chamados | Aceita |
| [ADR-004](ADR-004-workspace-isolation.md) | Modelo de isolamento por workspace | Aceita |
| [ADR-005](ADR-005-module-isolation.md) | Padrão de isolamento entre aplicações | Aceita |
| [ADR-006](ADR-006-global-asset-registry.md) | Registro Global de Ativos | Aceita |
| [ADR-007](ADR-007-realtime-for-tickets.md) | Supabase Realtime para chamados | Aceita |
| [ADR-008](ADR-008-three-layer-access-control.md) | Controle de acesso em três camadas | Aceita (substituída pelo RBAC 2.0 no enforcement de backend) |

## Relacionados

- [RBAC 2.0](../rbac/README.md)
- [Arquitetura do sistema](../architecture/system.md)
