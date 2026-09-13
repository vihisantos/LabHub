# Plataforma LabHub

> Ponto de entrada para a documentação da plataforma LabHub como um todo.

A plataforma é a base compartilhada por todas as aplicações: autenticação, autorização, workspaces, memberships, sincronização, infraestrutura Supabase/Vercel e padrões arquiteturais. O que é específico de uma aplicação fica em [`../apps/`](../apps/README.md).

Para o índice completo da documentação, consulte [`../README.md`](../README.md).

---

## Arquitetura

Como a plataforma funciona por dentro.

| Documento | Descrição |
|-----------|-----------|
| [Arquitetura do sistema](architecture/system.md) | Visão geral, padrões de fluxo de dados e ciclo de vida de requisições |
| [Frontend](architecture/frontend.md) | Estrutura React, layouts, contextos, hooks e padrões de componente |
| [Backend](architecture/backend.md) | Aplicação Flask, grupos de rotas, enforcement de RBAC e integrações |
| [Camada de dados](architecture/data-layer.md) | Arquitetura em três camadas: localStorage, engine de sync e Supabase |
| [Realtime](architecture/realtime.md) | Assinaturas WebSocket, broadcast, presença e fallback por polling |
| [Registro global de ativos](architecture/asset-registry.md) | `public.assets`, política de `metadata`, índices e repositório |
| [Administração de workspaces](architecture/workspaces-admin.md) | Ciclo de vida de workspaces e controle de aplicações por campus |
| [Roadmap RBAC 2.0, mascote e multiunidades](architecture/roadmap-rbac2.0-mascote-multiunidades.md) | Plano de evolução pós-reforma |

## Conceitos

Os conceitos do domínio, independentes de aplicação.

| Documento | Descrição |
|-----------|-----------|
| [Visão geral do sistema](concepts/system-overview.md) | O que é o LabHub, que problema resolve e princípios de arquitetura |
| [Workspaces](concepts/workspaces.md) | Multi-tenancy por campus e isolamento de dados |
| [Aplicações](concepts/applications.md) | Como a plataforma se organiza em aplicações independentes |
| [Ativos](concepts/assets.md) | O que é um ativo e como é rastreado |
| [Chamados](concepts/tickets.md) | Ciclo de vida de um chamado e SLA |
| [Offline-first](concepts/offline-first.md) | Estratégia local-first e comportamento sem internet |
| [Sincronização](concepts/synchronization.md) | Como os dados fluem entre localStorage e Supabase |

## Segurança

| Documento | Descrição |
|-----------|-----------|
| [Autenticação](security/authentication.md) | Fluxo de autenticação, ciclo de vida do usuário e guards |
| [Autorização](security/authorization.md) | Camadas de controle de acesso, RBAC 2.0, roles legados e RLS |

## RBAC 2.0

| Documento | Descrição |
|-----------|-----------|
| [Índice do RBAC 2.0](rbac/README.md) | Especificação, catálogo de Actions, enforcement, rollout e auditorias |
| [Especificação RBAC 2.0](../architecture/rbac2.0-specification.md) | Documento normativo (caminho canônico) |
| [Catálogo de Actions](../architecture/rbac2.0-actions-catalog.md) | Fonte de verdade das Actions (caminho canônico) |

## Decisões arquiteturais

| Documento | Descrição |
|-----------|-----------|
| [ADRs](decisions/README.md) | Decisões que moldaram a arquitetura da plataforma |
