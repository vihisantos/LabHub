# LabHub — Auditoria pós-produção RBAC 2.0 (2026-09-07)

> Auditoria **read-only** (2026-09-07). Nenhum código, migration, banco ou Vercel foi alterado.
> Escopo: verificação pós-ativação do RBAC 2.0 em produção (`RBAC_2_ENABLED=1`).

## Veredito

**HEALTHY WITH OBSERVATIONS**

- RBAC 2.0 está **ativo e saudável** em produção.
- Nenhum incidente, regressão, 5xx inesperado ou quebra de isolamento encontrado.
- Duas policies RLS permissivas **pré-existentes** foram identificadas como débito técnico de segurança (ver Issue #158).
- Roles `coordinator`, `est`, `adm`, `opv` seguem **sem membros reais**, aguardando decisão de negócio (ver Issue #159).

## Estado de produção auditado

| Item | Valor |
|---|---|
| Git | `main` = `origin/main` = `b8da015` |
| Vercel | `RBAC_2_ENABLED=1` (Production **e** Preview) |
| Deployment ativo | `dpl_BCrKTKgCswXKS75m2vCbTafTt3as` (READY, target=production) |
| Migrations | 000→043 (máx=043, nada novo após ativação) |
| RLS | ativa em 6 tabelas |
| Contagens | profiles=11, memberships=9, workspaces=3, roles=6, role_permissions=66, auth_users=13 |
| `describe_tv_app_data` | HTTP 200, contrato `tables`/`total`, sem `column "v"` |
| Testes | `pytest api`: 609 passed |
| Deployment events | 143 eventos, 0 errors, 0 warnings |

## Matriz RBAC validada (via motor, read-only)

- **Coordinator** (seed): 11 ALLOW corretos, DENY corretos, sem wildcard `admin.*`.
- **Técnico (`tec`)**, **Gestor (`est`)**, **Viewer (`vis`)**: deny-by-default, capacidade não seedada → DENY.
- **Super Admin**: bypass global (ALLOW independente de membership).
- **Isolamento por workspace**: membro→ALLOW; não-atribuído→DENY; workspace inexistente→DENY.
- **Fail-closed**: capability inexistente, role sem permissão, membership ausente, usuário `pending` → DENY.

Resultado: 34/34 checagens comportamentais corretas (2 "falhas" iniciais eram expectativas mal formuladas no script de auditoria, não bugs do sistema).

## Observações

### 1. Débito técnico pré-existente (RLS)

- `profiles_select USING(true)` e `workspaces_select USING(true)` expõem a qualquer `authenticated` a leitura de `profiles` (incl. `email`, `role`, `workspace_ids`, `is_super_admin`) e a lista completa de workspaces.
- **Pré-existentes** ao RBAC 2.0 (migrations 006/007/009, documentadas na 028). **Não** introduzidas pela ativação. **Não** são incidente/regressão da ativação.
- Correção deverá ocorrer em **migration futura (044+)**, após definição precisa do modelo de leitura. Migration NÃO foi criada nem aplicada.
- Registro: Issue **#158**.

### 2. Roles sem membros reais

- `coordinator`, `est`, `adm`, `opv` não possuem membros reais via `memberships`. Apenas `tec` (2) e `vis` (7).
- O seed das roles está correto; a ausência de membros **não é bug**.
- Atribuição depende de **decisão de negócio**; nenhum usuário foi atribuído.
- Super Admin (`demo-screenshots@labhub.com`, `vitor.santos@labhub.com`) continua com **bypass global** conforme arquitetura.
- Registro: Issue **#159**.

### 3. Limitações de observabilidade

- Runtime logs do deployment não estão disponíveis via API Vercel (HTTP 404 — limitação de plano). O monitoramento desta auditoria usou deployment events + requests HTTP reais.

## Rollback conceitual (não executado)

Reversão em 2 passos, sem tocar dados:

1. `RBAC_2_ENABLED=0` (ou remover o record) em Production no Vercel.
2. Novo deployment a partir de `main`.

Com a flag OFF, decorators/helpers retornam ao caminho legado (gates existentes). Nenhuma migration envolvida.

## Referências

- Issues: [#158](https://github.com/vihisantos/LabHub/issues/158), [#159](https://github.com/vihisantos/LabHub/issues/159)
- [RBAC 2.0 Specification](../architecture/rbac2.0-specification.md)
- [RBAC 2.0 Activation (Etapa 7)](../architecture/rbac2.0-etapa7-activation.md)
- [Gap Analysis pré-RBAC 2.0](rbac2.0-gap-analysis-2026-08.md)