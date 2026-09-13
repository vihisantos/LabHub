# Auditorias

> Análises, validações e snapshots datados do LabHub.

Cada documento desta pasta registra o estado do sistema em um momento específico. Eles **não** descrevem a arquitetura vigente: para isso, consulte [`../platform/`](../platform/README.md), [`../apps/`](../apps/README.md) e [`../reference/`](../reference/README.md).

## Estrutura

```text
audits/
├── architecture/   # Análises de arquitetura, banco de dados e autorização
└── features/       # Análises e validações de funcionalidades específicas
```

## architecture/

| Documento | Conteúdo |
|-----------|----------|
| [architecture-audit-2026-08](architecture/architecture-audit-2026-08.md) | Snapshot da arquitetura na versão 2.1.0 |
| [database-audit-2026-08](architecture/database-audit-2026-08.md) | Modelo de dados completo, com diagrama entidade-relacionamento |
| [rbac2.0-gap-analysis-2026-08](architecture/rbac2.0-gap-analysis-2026-08.md) | Comparação do estado real com o modelo-alvo do RBAC 2.0 |
| [rbac2.0-subapps-actions-audit-2026-08](architecture/rbac2.0-subapps-actions-audit-2026-08.md) | Autorização por aplicação, antes do catálogo de Actions |
| [rbac2.0-prod-audit-2026-09](architecture/rbac2.0-prod-audit-2026-09.md) | Verificação pós-ativação do RBAC 2.0 em produção |
| [rbac2.0-fase-9.0-membership-workspace-audit](architecture/rbac2.0-fase-9.0-membership-workspace-audit.md) | Drift entre `profiles.workspace_ids` e `memberships` |
| [rbac2.0-fase-9.3-a-workspace-ids-inventory](architecture/rbac2.0-fase-9.3-a-workspace-ids-inventory.md) | Inventário do legado `profiles.workspace_ids` |
| [rbac2.0-rls-hardening-044-discovery](architecture/rbac2.0-rls-hardening-044-discovery.md) | Discovery da migration 044 (hardening de RLS) |
| [rbac2.0-rls-hardening-044-design](architecture/rbac2.0-rls-hardening-044-design.md) | Design técnico da migration 044 |
| [rbac2.0-rls-hardening-044-dev-validation](architecture/rbac2.0-rls-hardening-044-dev-validation.md) | Validação da 044 em DEV |
| [rbac2.0-rls-hardening-044-staging-validation](architecture/rbac2.0-rls-hardening-044-staging-validation.md) | Validação da 044 em STAGING |
| [rbac2.0-rls-hardening-044-prod-audit-2026-09](architecture/rbac2.0-rls-hardening-044-prod-audit-2026-09.md) | Auditoria da 044 em produção |

Os documentos de RLS hardening 044 são referenciados diretamente por testes (`api/tests/test_044_rls_hardening_migration.py`) e mantêm seus caminhos originais.

## features/

| Documento | Conteúdo |
|-----------|----------|
| [chamados-feedback-professor-audit](features/chamados-feedback-professor-audit.md) | Análise do fluxo de avaliação do atendimento no Chamados |
| [chamados-push-pipeline-validation](features/chamados-push-pipeline-validation.md) | Validação ponta a ponta do pipeline de push e feedback |

## Diretrizes

- **Não atualize um documento de auditoria** — ele é um retrato de um momento
- **Referencie, não copie** — se a informação continua válida, ela pertence à documentação atual
- **Adicione novas auditorias com data no nome** — por exemplo, `database-audit-2027-01.md`
- **Ligue a partir das decisões** — quando uma decisão se baseia em uma auditoria, aponte para ela em [Decisões](../platform/decisions/README.md)

## Quando criar uma auditoria

- Revisão de segurança
- Análise de desempenho
- Verificação de completude de uma funcionalidade
- Avaliação de qualidade de código
- Snapshot de schema ou de arquitetura em um marco do projeto
