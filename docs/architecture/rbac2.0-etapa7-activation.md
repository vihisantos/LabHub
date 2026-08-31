# LabHub — RBAC 2.0 Etapa 7 — Fechamento de decisões e ativação controlada

## Objetivo

Fechar os `NEEDS_DECISION` da Etapa 6 sem inventar Actions, sem remover gates legados e sem ativar `RBAC_2_ENABLED` neste passo.

A fonte de verdade continua sendo o catálogo de Actions + schema 036. A Etapa 7 transforma os pontos ambíguos em decisões explícitas de rollout.

## Decisões finais

### 1. `GET /api/chamados` e `GET /api/chamados/reports`

**Decisão: não ativar RBAC 2.0 nestas rotas ainda.**

Motivo: ambas são operações multi-workspace e não possuem um único `workspace_id` que possa ser passado a `rbac_can(scope='workspace')` sem risco de autorizar uma workspace e retornar dados de outra.

Regra para a futura migração:

1. resolver as workspaces efetivamente visíveis ao usuário no servidor;
2. aplicar `ticket.view` / `ticket.report` por workspace;
3. filtrar a consulta pelo conjunto de workspaces autorizadas;
4. nunca usar "tem permissão em alguma workspace" como autorização para retornar dados de todas;
5. adicionar testes de não-vazamento cross-workspace antes de ativar.

Enquanto isso, os gates/isolamento existentes permanecem a autoridade destas rotas.

### 2. `ticket.weeklyEmail`

**Decisão: manter `scope='global'` no endpoint atual.**

A Action continua declarada no catálogo como `workspace`. O endpoint atual é explicitamente super-admin-only por `require_admin`; portanto o enforcement RBAC global reproduz exatamente a autoridade efetiva atual sem ampliar acesso para admins de workspace.

Uma futura migração para `scope='workspace'` só poderá ocorrer junto com a refatoração do endpoint para resolver um workspace-alvo de forma determinística e com aprovação explícita.

### 3. `/api/push/send`

**Decisão: manter `reservelab.push.manage`, scope global.**

A Action é literal no catálogo e corresponde diretamente ao endpoint. O gate legado é super-admin-only; `scope='global'` preserva esse comportamento. Não substituir por `admin.notification.send`, pois essa Action representa uma semântica diferente.

### 4. `/api/push/test` e `/api/chamados/push/test`

**Decisão: permanecer sem RBAC 2.0.**

Não existe Action literal específica para teste de push. Não será usado `reservelab.push.manage` nem `admin.notification.send` como substituto sem decisão de catálogo.

Os gates legados permanecem ativos.

### 5. `/api/push/action`

**Decisão: permanecer sem decorator RBAC enquanto o handler for misto.**

O endpoint executa operações semanticamente distintas (approve/reject). Uma única Action não representa ambas de forma segura. O futuro enforcement deverá ocorrer por ramo, com `admin.user.approve` e `admin.user.reject`, antes de cada side effect e com testes de cada caminho.

O gate legado super-admin permanece ativo até essa migração.

### 6. `/api/push/notify-loan` e `/api/push/notify-return`

**Decisão: permanecer no gate legado.**

Essas rotas são side-effects derivados do módulo Stock e não possuem uma Action única que represente com segurança a operação. Além disso, o catálogo atual registra o fluxo como legado/dead-in-production.

Não criar Action apenas para fechar a matriz da Etapa 7.

### 7. Drift `admin`

**Decisão: `adm` é a autoridade canônica do RBAC 2.0.**

A migration 036 define `adm = Admin de Workspace`, enquanto `profiles.role='admin'` e `LEGACY_ROLE_TO_ID` continuam sendo compatibilidade legada. O caminho RBAC ON não deve voltar a tratar `profile.role` como autoridade.

A conversão do frontend legado para o novo modelo fica como pré-requisito explícito da ativação de produção, porque alterar `LEGACY_ROLE_TO_ID` enquanto o frontend ainda usa os níveis locais poderia causar regressão de acesso com a flag OFF.

Portanto:

- RBAC 2.0: `adm` / membership / role_permissions / overrides;
- legado: `profiles.role` e `LEGACY_ROLE_TO_ID`, somente até a migração da UI;
- não fazer remapeamento parcial nesta etapa.

## Estado após Etapa 7

| Área | Estado |
|---|---|
| Engine | pronto |
| Schema 036 | pronto |
| Enforcement de Chamados por recurso | pronto |
| Push/send | protegido |
| Multi-workspace list/reports | deliberadamente adiado |
| Push test | legado |
| Push action | legado até split por ramo |
| Push notify loan/return | legado |
| `ticket.weeklyEmail` | global, reproduz gate super-admin |
| `admin` → `adm` | decidido como canônico para RBAC; legado preservado até cutover da UI |
| `RBAC_2_ENABLED` | **OFF** |

Não há mais `NEEDS_DECISION` implícito: os itens acima são decisões de rollout documentadas.

## Runbook de ativação

### Fase 0 — pré-flight obrigatório

Antes de ligar a flag em qualquer ambiente:

- migration 036 aplicada;
- roles `tec`, `vis`, `est`, `opv`, `adm` presentes;
- role_permissions sem Actions fora do catálogo;
- memberships backfilled e com status `active` para usuários elegíveis;
- nenhum usuário não-super depende exclusivamente de `profiles.role='admin'` para autorização RBAC;
- auditoria `rbac_audit_logs` acessível pelo backend e somente leitura para super-admin;
- `RBAC_2_ENABLED` ausente/`0` no ambiente de produção.

### Fase 1 — staging

1. aplicar 036;
2. manter todos os gates legados;
3. definir `RBAC_2_ENABLED=1` somente no staging;
4. executar a suíte completa;
5. testar explicitamente super-admin, técnico, viewer, admin de workspace, usuário não membro, membership suspensa e override deny/allow;
6. validar que cada DENY gera 403 seguro e audit `outcome='denied'`;
7. validar que falha de auditoria nunca vira ALLOW;
8. validar ausência de cross-workspace reads/writes.

### Fase 2 — produção controlada

A ativação é por variável de ambiente única:

```text
RBAC_2_ENABLED=1
```

Ativar primeiro em uma janela controlada, com possibilidade imediata de rollback para:

```text
RBAC_2_ENABLED=0
```

O rollback é seguro porque os decorators/helpers retornam ao caminho legado quando a flag está OFF.

### Fase 3 — pós-ativação

Monitorar:

- volume de `rbac_audit_logs` por action/outcome;
- picos inesperados de 403;
- erros de lookup nas cinco tabelas RBAC;
- divergência entre membership e legado;
- tentativas cross-workspace;
- rotas ainda protegidas somente por gates legados.

Não remover gates legados durante esta fase.

## Critério para remover legado

Nenhum `require_admin`, `role='admin'`, `profiles.workspace_ids` ou AppGuard legado deve ser removido apenas porque a flag foi ligada. A remoção só começa em uma etapa posterior, depois de:

1. cutover da UI para memberships/RBAC;
2. resolução dos endpoints multi-workspace;
3. split de endpoints mistos;
4. paridade de testes;
5. observação em produção;
6. plano de rollback independente.

## Conclusão

A Etapa 7 fecha as decisões sem ampliar o catálogo e sem transformar ambiguidades em permissões permissivas. O sistema fica pronto para ativação controlada, mas a flag permanece **OFF** até o pré-flight e o cutover da UI legado estarem concluídos.
