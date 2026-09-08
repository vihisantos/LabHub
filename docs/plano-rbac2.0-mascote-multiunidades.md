# LABHUB — PLANO PÓS-REFORMA (RBAC 2.0 + Mascote + Multiunidades)

> **Documento de plano de negócio — marco zero salvo em 2026-09**
> Este documento guarda, na íntegra e sem cortes, o plano de evolução do LabHub
> para o ciclo pós-reforma. Ele foi registrado enquanto a **área de espera dos
> usuários pendentes** (Approval Waiting Page) ainda está em andamento.
>
> A ordem deste documento de trabalho é:
>
> ```text
> 1. Reforma da área de espera
>     ↓
> 2. Auditoria/correção do fluxo pending
>     ↓
> 3. Mascote como sistema de estados
>     ↓
> 4. Transição pending → active
>     ↓
> 5. RBAC 2.0 — cargos e hierarquia
>     ↓
> 6. Definição formal de liderança
>     ↓
> 7. Coordenador Multiunidades
>     ↓
> 8. Área do Líder
>     ↓
> 9. Expansão do mascote pelo LabHub
>     ↓
> 10. Auditoria de segurança
>     ↓
> 11. Testes completos
>     ↓
> 12. Consolidação do LabHub
> ```

---

## Marco atual

**Reforma da área de espera de usuários**

A nova área de espera será o primeiro marco deste ciclo.

Ela deverá representar corretamente o estado `pending`, mantendo o usuário
completamente bloqueado até a aprovação e introduzindo o mascote como elemento
vivo da experiência do LabHub.

---

# PARTE 1 — PLANO PÓS-REFORMA

## FASE 1 — Fluxo de aprovação

### Objetivo

Garantir que o ciclo de vida do usuário esteja correto e seguro.

### Entregas

- `pending` = zero acesso ao sistema;
- nova Approval Waiting Page;
- `active` = acesso normal;
- `rejected` = fluxo de rejeição;
- proteção contra acesso direto por URL;
- validação dos Guards;
- validação do backend;
- testes do fluxo de aprovação;
- polling/atualização do status quando necessário.

### Critério de conclusão

Um usuário pending consegue apenas:

> entrar → visualizar a área de espera → aguardar aprovação.

Nada além disso.

---

## FASE 2 — Sistema do Mascote LabHub

### Objetivo

Transformar o mascote em um componente real do ecossistema LabHub.

O mascote deixa de ser apenas uma ilustração e passa a possuir **estados e
comportamentos**.

### Estados iniciais

- idle
- loading
- thinking
- waiting
- approved
- error
- notification
- celebration
- sleeping

### Arquitetura

Criar uma forma padronizada de controlar o mascote através do sistema:

```text
Estado
   ↓
Mascote
   ↓
Animação / expressão / movimento
```

O SVG deverá permitir interação através de React/CSS/JavaScript sem transformar
o mascote em mecanismo de segurança.

---

## FASE 3 — Experiência de aprovação

### Objetivo

Fazer o mascote acompanhar o usuário durante o período de espera.

Fluxo:

```text
PENDING
   ↓
Mascote WAITING
   ↓
usuário aguarda
   ↓
status muda para ACTIVE
   ↓
Mascote APPROVED
   ↓
celebração
   ↓
LabHub
```

A experiência deverá ser:

- profissional;
- divertida na medida certa;
- responsiva;
- mobile-first;
- coerente com a identidade LabHub.

---

## FASE 4 — RBAC 2.0: cargos e hierarquia

### Objetivo

Consolidar o modelo de cargos e separar claramente:

- cargo;
- permissões;
- nível hierárquico;
- liderança;
- escopo de atuação;
- workspace/unidade.

### Regra fundamental

**Somente cargos classificados como liderança podem liderar outros usuários.**

Não basta possuir uma permissão administrativa.

O sistema deverá saber explicitamente se determinado cargo é ou não um cargo de
liderança.

Conceitualmente:

```text
Técnico
└── não liderança

Visualizador
└── não liderança

Líder
└── liderança

Coordenador Multiunidades
└── liderança
```

---

## FASE 5 — Hierarquia organizacional

Criar uma estrutura coerente de liderança.

Exemplo:

```text
                 COORDENADOR MULTIUNIDADES
                         │
              ┌──────────┴──────────┐
              │                     │
           LÍDER A                LÍDER B
              │                     │
        ┌─────┴─────┐         ┌─────┴─────┐
        │           │         │           │
     Técnico     Técnico   Técnico     Técnico
```

Um usuário que não possui cargo de liderança não poderá:

- liderar usuários;
- receber subordinados;
- ser tratado como líder;
- aparecer como responsável hierárquico de uma equipe.

---

## FASE 6 — Coordenador Multiunidades

### Objetivo

Criar uma experiência específica para o cargo de Coordenador Multiunidades.

Esse cargo representa **liderança**, não simplesmente uma permissão
administrativa.

O coordenador possui escopo potencialmente superior ao de um líder de uma única
unidade.

### Área própria

A área do Coordenador Multiunidades será diferente da área de um Líder.

Ela deverá futuramente permitir trabalhar com:

- múltiplas unidades;
- equipes;
- líderes;
- indicadores;
- visão consolidada;
- estrutura hierárquica;
- responsabilidades por unidade.

### Estado atual

Enquanto essa área estiver em desenvolvimento, exibir:

> 🚧 **Área do Coordenador Multiunidades**
> Esta área está sendo construída. Em breve você poderá acompanhar e administrar
> sua estrutura de liderança entre as unidades sob sua responsabilidade.

O cargo pode existir no RBAC antes da área estar pronta.

**Não liberar uma funcionalidade incompleta como se estivesse pronta.**

---

## FASE 7 — Área do Líder

Depois da estrutura do Coordenador Multiunidades, implementar a experiência
específica do Líder.

O Líder deverá conseguir trabalhar com sua equipe dentro do escopo permitido.

Possíveis recursos:

- visualizar equipe;
- acompanhar chamados;
- acompanhar indicadores;
- acompanhar atividades;
- distribuição de responsabilidades;
- gestão dos usuários subordinados;
- visão da própria unidade.

Tudo deverá respeitar:

```text
Cargo
+
Liderança
+
Workspace
+
Permissões
```

---

## FASE 8 — Modelo definitivo de RBAC

Consolidar o RBAC 2.0.

O sistema deverá separar claramente:

```text
IDENTIDADE
   ↓
STATUS
   ↓
CARGO
   ↓
NÍVEL HIERÁRQUICO
   ↓
PERMISSÕES
   ↓
ESCOPO
   ↓
WORKSPACE
```

Isso deverá evitar que uma simples permissão transforme automaticamente alguém
em líder.

---

## FASE 9 — Experiência global do LabHub

Depois de estabilizar aprovação + mascote + RBAC:

Expandir o mascote para o restante do ecossistema.

Exemplos:

```text
Login
   → idle

Carregando
   → loading

Processando
   → thinking

Chamado criado
   → celebration

Erro
   → error

Notificação importante
   → notification

Usuário inativo
   → sleeping
```

O mascote passa a ser uma linguagem visual comum entre os módulos.

---

## FASE 10 — Auditoria de segurança pós-RBAC

Após implementar as mudanças:

Auditar novamente:

- Auth;
- Guards;
- RBAC;
- workspace isolation;
- RLS;
- backend;
- rotas;
- APIs;
- permissões;
- hierarquia;
- acesso entre unidades.

Executar testes adversariais.

Especialmente:

```text
usuário comum → não pode liderar
líder → somente seu escopo
coordenador → somente suas unidades
pending → zero acesso
usuário de outra unidade → sem acesso indevido
```

---

## FASE 11 — Testes profissionais

Expandir a suíte de testes do LabHub.

### Unit

- status;
- cargos;
- liderança;
- permissões;
- mascote;
- resolução de acesso.

### Integration

- aprovação;
- RBAC;
- workspace;
- hierarquia.

### E2E

- signup → pending;
- pending → waiting page;
- aprovação → active;
- active → LabHub;
- líder → área de liderança;
- coordenador → área multiunidades;
- acesso indevido → bloqueado.

### Segurança

Testes cross-workspace e tentativas de escalada de privilégio.

---

## ORDEM OFICIAL DO TRABALHO

A ordem deste ciclo será:

```text
1. Reforma da área de espera
        ↓
2. Auditoria/correção do fluxo pending
        ↓
3. Mascote como sistema de estados
        ↓
4. Transição pending → active
        ↓
5. RBAC 2.0 — cargos e hierarquia
        ↓
6. Definição formal de liderança
        ↓
7. Coordenador Multiunidades
        ↓
8. Área do Líder
        ↓
9. Expansão do mascote pelo LabHub
        ↓
10. Auditoria de segurança
        ↓
11. Testes completos
        ↓
12. Consolidação do LabHub
```

---

## PRINCÍPIO CENTRAL

O LabHub deve evoluir de:

> "um hub com vários sistemas"

para:

> **"uma plataforma com identidade, usuários, cargos, hierarquia, permissões,
> unidades e experiências próprias."**

O mascote representa a identidade e a experiência.

O RBAC representa a autoridade.

O status representa o ciclo de vida do usuário.

O workspace representa o escopo.

E nenhuma dessas responsabilidades deve ser misturada.

---

# PARTE 2 — EXPANSÃO DO PLANO (COORDENADOR MULTIUNIDADES + DASHBOARDS + EXPERIÊNCIA PC)

> Etapa complementar ao plano pós-reforma da área de espera.

---

## 1. COORDENADOR MULTIUNIDADES — COCKPIT DE LIDERANÇA

O Coordenador Multiunidades deverá possuir uma área própria, diferente da
experiência dos demais cargos.

A ideia não é simplesmente dar acesso a mais páginas.

Ele deverá possuir uma **central de liderança multiunidades**, reunindo as
informações necessárias para acompanhar suas unidades em um único lugar.

---

## 2. DASHBOARD DE CHAMADOS

O Coordenador deverá ter acesso aos dashboards de Chamados.

A área deverá permitir visualizar, de forma consolidada:

- chamados abertos;
- chamados em andamento;
- chamados aguardando;
- chamados fechados;
- chamados atrasados;
- tempo médio de atendimento;
- volume por período;
- distribuição por status;
- evolução dos chamados;
- indicadores relevantes da operação.

Quando possível, aproveitar os dashboards existentes do módulo de Chamados em vez
de criar métricas duplicadas.

---

## 3. DADOS POR UNIDADE — REGRA VISUAL FUNDAMENTAL

O maior cuidado dessa área será evitar que dados de diferentes unidades sejam
confundidos.

Todo indicador deverá deixar **explícita sua unidade de origem**.

Exemplo:

```text
CHAMADOS ABERTOS

Piracicaba
32 chamados

Mooca
18 chamados

Paulista
27 chamados

Vila Olímpia
14 chamados
```

Nunca apresentar simplesmente:

```text
91 chamados
```

sem deixar claro que se trata de um consolidado.

---

## 4. VISÃO CONSOLIDADA + VISÃO POR UNIDADE

O Coordenador deverá possuir duas perspectivas:

### VISÃO GERAL

```text
TODAS AS UNIDADES

Chamados: 91
Em andamento: 37
Atrasados: 8
Fechados: 46
```

### VISÃO POR UNIDADE

```text
PIRACICABA

Chamados: 32
Em andamento: 12
Atrasados: 3
```

```text
MOOCA

Chamados: 18
Em andamento: 7
Atrasados: 1
```

E assim por diante.

A interface deve deixar visualmente impossível confundir um dado individual com
um dado consolidado.

---

## 5. FILTRO DE UNIDADE

O Coordenador deverá poder selecionar uma unidade.

Exemplo:

```text
Unidade
[ Todas as unidades ▼ ]
```

Opções:

```text
Todas
Piracicaba
Mooca
Paulista
Vila Olímpia
São José dos Campos
```

Ao selecionar uma unidade, todos os dashboards e indicadores devem refletir
aquele contexto.

O contexto selecionado deve permanecer visualmente evidente.

---

## 6. CONTEXTO DE DADOS

Sempre que possível, os componentes deverão carregar o contexto:

```text
Unidade
Período
Indicador
```

Exemplo:

```text
Chamados — Piracicaba
01/09 → 07/09

32 chamados
```

Isso reduz drasticamente o risco de interpretação errada.

---

## 7. ÁREA DO COORDENADOR

A futura área poderá possuir uma estrutura semelhante a:

```text
COORDENADOR MULTIUNIDADES

┌──────────────────────────────┐
│ Visão Geral                  │
├──────────────────────────────┤
│ Unidades                     │
├──────────────────────────────┤
│ Chamados                     │
├──────────────────────────────┤
│ Equipes                      │
├──────────────────────────────┤
│ Líderes                      │
├──────────────────────────────┤
│ Indicadores                  │
└──────────────────────────────┘
```

Na página inicial:

```text
Olá, Coordenador 👋

Visão geral das suas unidades

[ Todas as unidades ▼ ]

┌─────────┐ ┌─────────┐ ┌─────────┐
│ Chamados│ │Atrasados│ │ Equipes │
│   91    │ │    8    │ │    5    │
└─────────┘ └─────────┘ └─────────┘

Chamados por unidade
...

Desempenho das unidades
...

Atividade recente
...
```

---

## 8. EXPERIÊNCIA DESKTOP / PC

A partir desta etapa, o Coordenador Multiunidades será o primeiro módulo do
LabHub a receber uma experiência realmente responsiva para desktop.

O LabHub continuará sendo PWA/mobile-first, mas deverá reconhecer que existem
dois contextos de utilização:

```text
PWA / celular
        ↓
experiência mobile

Site / PC
        ↓
experiência desktop
```

Não significa criar dois sistemas diferentes.

Significa possuir **uma mesma aplicação com layouts adaptativos**.

---

## 9. MOBILE

No celular/PWA:

- navegação compacta;
- cards empilhados;
- informações prioritárias;
- gráficos adaptados;
- bottom navigation quando apropriado;
- foco em leitura rápida.

---

## 10. DESKTOP

No PC:

- aproveitamento maior da largura;
- sidebar/navigation lateral quando fizer sentido;
- dashboards lado a lado;
- múltiplos cards na mesma linha;
- gráficos maiores;
- tabelas mais completas;
- filtros mais ricos;
- mais informações simultaneamente;
- melhor aproveitamento de espaço;
- experiência de dashboard profissional.

Exemplo conceitual:

```text
┌──────────────┬───────────────────────────────────────────┐
│              │ COORDENADOR MULTIUNIDADES                │
│   MENU       ├───────────────────────────────────────────┤
│              │ [Todas] [Período]                        │
│  Visão Geral │                                           │
│  Unidades    │ ┌────────┐ ┌────────┐ ┌────────┐        │
│  Chamados    │ │Chamados│ │Atrasados│ │ Equipes│        │
│  Equipes     │ │   91   │ │    8   │ │    5   │        │
│  Líderes     │ └────────┘ └────────┘ └────────┘        │
│  Indicadores │                                           │
│              │ ┌──────────────────┐ ┌────────────────┐ │
│              │ │ Chamados/unidade  │ │ Desempenho    │ │
│              │ │                  │ │                │ │
│              │ └──────────────────┘ └────────────────┘ │
│              │                                           │
└──────────────┴───────────────────────────────────────────┘
```

Isso será muito mais adequado para um coordenador trabalhando em computador.

---

## 11. NÃO CRIAR DOIS FRONTENDS

A implementação deverá evitar:

```text
MobileApp
DesktopApp
```

como aplicações separadas.

Preferir:

```text
mesma aplicação
       ↓
responsive layout
       ↓
mobile / tablet / desktop
```

Componentes devem se adaptar ao espaço disponível.

---

## 12. RESPONSIVIDADE COMO PADRÃO FUTURO

Nesta etapa, **somente o Coordenador Multiunidades precisa receber a experiência
desktop completa**.

Não refatorar todos os módulos agora.

Depois que essa experiência estiver madura, usar o aprendizado para iniciar uma
evolução progressiva:

```text
Coordenador Multiunidades
        ↓
modelo desktop aprovado
        ↓
Chamados
        ↓
Stock
        ↓
PCare
        ↓
TV/Música
        ↓
Launcher
        ↓
LabHub completo
```

Assim não criamos uma grande migração de uma vez.

---

## 13. REGRA DE SEGURANÇA MULTIUNIDADES

O fato de o Coordenador visualizar múltiplas unidades NÃO significa acesso
irrestrito.

Seu escopo deverá determinar exatamente quais unidades ele pode visualizar.

Exemplo:

```text
Coordenador
├── Piracicaba      ✓
├── Mooca           ✓
├── Paulista        ✓
├── Vila Olímpia    ✓
└── Unidade X       ✗
```

O dashboard deve respeitar o mesmo escopo.

Nunca confiar apenas no filtro visual.

A filtragem deverá ser garantida pelas camadas de autorização/backend/RLS quando
aplicável.

---

## 14. ESTADO "EM CONSTRUÇÃO"

Enquanto a área completa do Coordenador ainda não estiver pronta:

```text
🚧 Área do Coordenador Multiunidades

Estamos construindo esta experiência para oferecer
uma visão completa das unidades, equipes e indicadores
sob sua responsabilidade.

Em breve esta área estará disponível.
```

O aviso deve ser elegante e integrado ao LabHub.

Não apresentar funcionalidades falsas.

---

## 15. FUTURO DO DASHBOARD

A arquitetura deverá permitir futuramente adicionar:

- indicadores de SLA;
- ranking de unidades;
- comparação entre unidades;
- tendências;
- chamados por categoria;
- chamados por prioridade;
- desempenho das equipes;
- desempenho dos líderes;
- volume por período;
- alertas;
- indicadores operacionais;
- exportação de relatórios.

Sempre mantendo o contexto da unidade explícito.

---

## 16. PRINCÍPIO DE UX

O Coordenador não deve precisar "adivinhar" de onde veio um número.

Todo dado deverá responder visualmente:

> O que é?
>
> De qual unidade?
>
> De qual período?
>
> Qual é o contexto?

Essa regra deve fazer parte da arquitetura visual dos dashboards.

---

## 17. ORDEM ATUALIZADA DO ROADMAP

O roadmap passa a ser:

```text
1. Reforma da área de espera
        ↓
2. Correção do fluxo pending
        ↓
3. Mascote como sistema de estados
        ↓
4. pending → active
        ↓
5. RBAC 2.0
        ↓
6. Cargos e hierarquia
        ↓
7. Definição formal de liderança
        ↓
8. Coordenador Multiunidades
        ↓
9. Dashboard de Chamados
        ↓
10. Visão consolidada por unidades
        ↓
11. Experiência desktop do Coordenador
        ↓
12. Área do Líder
        ↓
13. Expansão do mascote
        ↓
14. Evolução desktop dos demais módulos
        ↓
15. Auditoria de segurança
        ↓
16. Testes completos
```

---

## PRINCÍPIO FINAL

O Coordenador Multiunidades será o primeiro laboratório do LabHub para uma
experiência de liderança realmente profissional:

**mobile quando estiver no celular,**

**desktop quando estiver no PC,**

**dados consolidados quando necessário,**

**dados separados por unidade quando necessário,**

e sempre com o escopo e a origem da informação explícitos.

---

## CHECKLIST DE IMPLEMENTAÇÃO — CICLO C (Fases 4–6: cargos / liderança / área do Coordenador)

> Sessão de 2026-09-08. Implementado e verificado (testes + lint + build verdes). O mascote foi adiado — "primeiro o plano do RBAC, depois voltamos ao mascote".

- [x] **Fase 4 — Classificação formal de liderança no cargo.** `Role` ganhou `isLeadership?: boolean` e `leadershipLevel?: number` (`src/core/permissions/types.ts`). Liderança é **propriedade do cargo**, separada de appAccess/manageQr.
- [x] **Cargo canônico Líder (`role-lider`).** Novo default em `DEFAULT_ROLES` (key `lider`, nível Leader=1, não-default, manageQr true, escopo de unidade: chamados full, stock/pc-care read). Mapeamento `lider → role-lider` em `resolveRoleId`/`LEGACY_ROLE_TO_ID` e `role-lider → lider` em `ROLE_ID_TO_DB` (`adminService`).
- [x] **Hierarquia (Fase 5).** `LeadershipLevel` (None=0/Leader=1/Coordinator=2) + helpers em `src/core/permissions/leadership.ts`: `isLeadershipRole`, `leadershipLevelOf`, `leadershipLabelOf`, `leadershipAreaOf` (team=unidade / coordination=multiunidades, por key canônica — cargo sem key é fail-closed), `isHigherLeadership`.
- [x] **Migração idempotente.** `permissionService.migrate()` semeia `role-lider` e faz backfill de `isLeadership`/`leadershipLevel` em coleções antigas (defaults canônicos; custom vira executante — fail-closed).
- [x] **Regra dura (Fase 4): só cargo de liderança lidera.** Hook `useLeadership` + guard `LeadershipAreaGuard` (`scope: 'coordination' | 'team'`) em `src/core/permissions/`. Área NUNCA depende de appAccess/override; super admin não é liderança por cargo.
- [x] **Fase 6 — Área do Coordenador em estado "em construção".** Rota `/coordenador` (AuthGuard + LeadershipAreaGuard coordination) → `src/platform/Coordinator/CoordinatorHome.tsx`: sem funcionalidades falsas; mostra unidades atribuídas reais e lista o que virá (chips informativos, sem CTA navegável). Card "Minha Liderança" no Launcher (apenas para coordenação).
- [x] **Visibilidade no admin.** Badge "Liderança" em `UsersPage` (linha da pessoa) e `RolesPage` (detalhe do cargo).
- [x] **Testes verdes.** `leadership.test.ts` (modelo/helpers/migração/backfill), `LeadershipAreaGuard.test.tsx` (matriz de acesso), `CoordinatorHome.test.tsx` (sem features falsas), regressões do `coordinator.test.ts` (4 cargos) e admins. Suite completa: 1705 passando + 1 flaky-load preexistente (BatchCreateModal, timeout 5s sob carga).
- [x] **Fase 7 (Área do Líder, scope team):** concluída — vínculo líder→equipe persistido (`memberships.managed_by` + RPC `get_leader_team`), helpers de autorização, rota `/lider` real. Detalhes no **CICLO D** abaixo.
- [ ] **Fases 8+:** release real dos recursos do Coordenador (unidades → equipes → lideranças → chamados → indicadores → desktop).

---

## CHECKLIST DE IMPLEMENTAÇÃO — CICLO D (Fase 7: escopo `team` → Área do Líder)

> Sessão de 2026-09-08. Implementado e verificado (testes 200/200 arquivos · 1735 testes, oxlint, tsc + vite build verdes). Mascote permanece congelado.

- [x] **7.1 — Levantamento do modelo.** Workspaces + memberships em duas camadas (`profiles.workspace_ids` legado e `profiles` como fonte da verdade; trigger 041 deriva `public.memberships`, RLS `user_belongs_to_workspace`). **Não existia nenhuma estrutura de equipe/time/setor**; `Role.leaderId` é display-only e contradiz a spec (liderança é relação de membership por unidade, não atributo global). `RBAC_2_ENABLED=OFF` no Flask; enforcement real = RLS.
- [x] **7.2 — Migração `045_membership_leadership_managed_by.sql` + testes SQL.**
  - Seed do cargo `lider` (slug `lider`, blueprint global, `is_system`, **sem** `role_permissions` — liderança não auto-concede ações).
  - `profiles_role_check` aceita `lider`/`role-lider`; `sync_user_memberships` mapeia lider e **preserva `managed_by`** no upsert.
  - Coluna `memberships.managed_by uuid REFERENCES memberships(id) ON DELETE SET NULL` + CHECK que não admite self-reference + índices.
  - Trigger `trg_memberships_manager_guard` (BEFORE INSERT/UPDATE OF managed_by): mesmo workspace, gestor ativo, sem ciclos (CTE recursiva, profundidade 64).
  - Helpers SECURITY DEFINER (search_path=public, REVOKE anon/PUBLIC, GRANT authenticated): `membership_is_manager_of`, `user_manages_membership`, **`get_leader_team(workspace_id)`** — SETOF memberships, **fail-closed** (vazio para quem não é cargo `lider` ativo na unidade).
  - Backfill de memberships para perfis com cargo lider; RLS de SELECT de memberships **intencionalmente não fechado** (roster por unidade segue; escopo do líder vive em `managed_by` + RPC escopado).
  - `supabase/migrations/tests/045_membership_leadership_checks.sql`: 7 grupos de asserção (seed, CHECK, mapping, coluna/FK/CHECK/índices, trigger, helpers, privilégios). Validação SQL roda em staging/SQL Editor (sem Postgres local).
- [x] **7.3 — Modelo frontend.** `src/core/permissions/membership.ts` — tipos `Membership/TeamMember/TeamContext` + `dbRoleToRoleId` (fail-closed `role-<db>`) + autorizadores puros `canViewTeam`, `canManageTeam` (=canViewTeam na F7), `canViewTeamMember` (membro do escopo OU self). `src/core/permissions/teamService.ts` — `getLeaderTeam(ws)` via `defaultDb.rpc('get_leader_team')` + join em `profiles` (primeiro consumidor de RPC do repo); fail-closed `[]` + `getLastTeamServiceError`. `src/core/permissions/useTeam.ts` — hook reativo ao `workspaceStore` (troca de unidade re-consulta; vazio legítimo ≠ erro).
- [x] **7.4 — Rota e primeira versão real.** `/lider` em `App.tsx` (AuthGuard → LeadershipAreaGuard `scope="team"` → lazy) → `src/platform/Lider/LiderHome.tsx`: membros reais do RPC, indicadores derivados (total, carga por cargo), estados carregando/erro(+retry)/sem unidade/vazio honesto. Launcher: card "Minha Liderança" também com badge "Equipe" → `/lider`. **Sem CTA de gestão falso.**
- [x] **7.5 — Testes (30 novos).** `membership.test.ts` (matriz: líder ✓ / coordenador ✗ / executante ✗ mesmo com app_access full / super admin ✗ / sem usuário ✗ / custom sem key ✗ / outsider ✗; mapeamento db→roleId). `teamService.test.ts` (RPC+join, perfil oculto→null, erros→`[]`+erro sinalizado, vazio legítimo→sem erro, defaultDb null→`[]`). `useTeam.test.tsx` (sem workspace→vazio, load, erro→failed, vazio honesto, troca de unidade re-consulta). `LiderHome.test.tsx` (carregando/sem unidade/erro+retry/vazio real/com equipe/sem CTAs).
- [x] **7.6 — Bateria completa.** `npm run test:run` (200 arquivos · 1735 testes ✓ · 1 skip), `npm run lint` (apenas warnings pré-existentes), `npm run build` (tsc + vite ✓). Regressão Fases 1–6 inclusa na suíte.

---

## CHECKLIST DE IMPLEMENTAÇÃO — CICLO E (Fase 7.7: auditoria de fechamento)

> Sessão de 2026-09-08. Auditoria dos 10 pontos de atenção da Fase 7 contra o código real (SQL/RLS/RPC + guards + serviço). **3 lacunas encontradas e fechadas na migration `046_audit_fase7_closing.sql`.** Testes 48/48 nos arquivos auditados, lint e build verdes.

### Resultado ponto a ponto

| # | Ponto auditado | Resultado |
|---|---|---|
| 1 | `managed_by` não atravessa workspace | ⚠️ **GAP fechado**: trigger só disparava em `UPDATE OF managed_by` — mover membership de unidade com vínculo intacto criava cross-workspace sem guarda; e `get_leader_team` não filtrava `m.workspace_id`. **046**: `UPDATE OF managed_by, workspace_id` + `AND m.workspace_id = p_workspace_id`. |
| 2 | Líder não gerencia outro líder indevidamente | ⚠️ **GAP fechado**: escrita é super-admin-only (036), mas a trigger permitia lider→lider na mesma unidade. **046**: gestor só com cargo de liderança (`lider`\|`coordinator`) e `lider` não gerencia `lider` no mesmo workspace (coordenador gere lideres na Fase 8). |
| 3 | Usuário sem cargo `lider` não explora RPCs | ✅ `get_leader_team`: `auth.uid()` + `r.slug='lider'` + `me.status='active'`, REVOKE anon/PUBLIC, GRANT authenticated. Fail-closed. |
| 4 | Ciclo A→B→A impossível | ⚠️ **GAP fechado**: detecção rodava só em UPDATE; INSERT com id já-referenciado criava ciclo. **046**: CTE recursiva (depth 64) roda em INSERT e UPDATE. |
| 5 | Troca/remoção de workspace sem vínculo órfão | ✅/⚠️ **Fechado**: `ON DELETE SET NULL` e sync já zeravam dependentes; orfandade por UPDATE de workspace coberta pelo item 1. |
| 6 | Membership desativada não forma equipe | ✅ RPC filtra `me.status` e `m.status = 'active'`; `membership_is_manager_of`/`user_manages_membership` também. |
| 7 | RLS/RPC fail-closed | ✅ SECURITY DEFINER `search_path=public`, REVOKE anon/PUBLIC com GRANT authenticated; SELECT `user_belongs_to_workspace`/super admin; escrita super-admin-only. |
| 8 | Frontend não forja escopo | ✅ UI só consome `get_leader_team(workspace_id ativo)`; escopo revalidado por `auth.uid()` server-side. |
| 9 | Viewer/técnico não acessa `/lider` | ✅ Guard `scope="team"` nega (`!isLeadership || area !== scope`); **+2 testes**: líder entra em `/lider` e viewer/técnico negado. |
| 10 | Super admin não ganha `scope: team` | ✅ Sem memberships (041) + cargo não-liderança → guard nega; RPC vazio (dupla proteção). |

### Artefatos

- `supabase/migrations/046_audit_fase7_closing.sql` — reforços da guarda (itens 1, 2, 4) + documentação dos invariantes.
- `supabase/migrations/tests/046_audit_fase7_closing.sql` — asserções estruturais/catálogo (escopo explícito, trigger `UPDATE OF managed_by, workspace_id`, regras de cargo, ciclo sem gate por `TG_OP`, ACL). Comportamental roda no staging como session autenticada.
- `src/core/permissions/__tests__/LeadershipAreaGuard.test.tsx` — caso positivo (líder entra em `/lider`) e viewer/técnico negado.
- Suite audita executada: **48 testes ✓** (guard, membership, teamService, useTeam, LiderHome, leadership) + lint + build.

**Conclusão 7.7:** auditoria **verde** após fechamento das 3 lacunas. Base consistente para a **Fase 8 — Gestão do Coordenador**. O mascote permanece congelado.

---

## CHECKLIST DE IMPLEMENTAÇÃO — CICLO F (Fase 8: gestão do Coordenador / scope `coordination`)

> Sessão de 2026-09-08. **8.1 = mapa (sem código)**; **8.2 = implementação** aprovada. Migração `047` + RPCs de escopo e escrita escopada; tela `/coordenador` real (unidades → lideranças → equipes). Suite: **202 arquivos · 1754 testes ✓ · 1 skip**; oxlint e `tsc + vite build` verdes. Mascote permanece congelado.

### FASE 8.1 — MAPA (2 agentes explore: docs + backend; zero código)

| # | Ponto levantado | Resultado |
|---|---|---|
| 1 | Identificação do coordenador | 4 facetas: cargo `coordinator` (DB: blueprint global, `is_system`, 040) + `role-coordinator` (frontend, `isLeadership`, level 2); memberships ativas por unidade (sync 041/045); unidades derivadas de `workspace_ids` (legado) no banco; **predicado `is_coordinator_of` não existia** (lacuna). |
| 2 | `scope: coordination` hoje | Leitura via RLS = roster/`profile_visible_to_me` (044) igual de qualquer membro — **sem leitura escopada**; `get_leader_team` só serve líder (`r.slug='lider'`). Drift latente: `user_belongs_to_workspace` lê `workspace_ids` (legado) vs memberships (044:22). |
| 3 | Hierarquia | Super Admin (não-cargo) > Coordenador > Admin WS > Técnico > Visualizador (040); `isHigherLeadership` (level 2>1>0). Árvore-alvo: coord → unidades → líderes → membros. |
| 4 | Vínculo com `managed_by` | A trigger 045+046 **já suporta `coordinator→lider`** (bloqueia só lider→lider). Falta caminho o coordenador ESCREVER `managed_by` (RLS 036 é super-admin-only). |
| 5 | Ações do catálogo → Fase 8 | Seed 040 já concede as 11 `workspace`-scoped (ticket.* e export); `create/remove` de recursos e `admin.*` **fora**; ações de chamados ficam **fora desta fase** (motor já ativo). |
| 6 | Backend reutilizável vs novo | Reutiliza: seed coordinator, sync, memberships+managed_by, trigger 046, helpers 045, `profile_visible_to_me`, motor rbac.py. **Novo:** predicado, RPCs de leitura do escopo e RPC de escrita escopada (migration 047). |
| 7 | Matriz adversarial | coord A→unidade A ✅ / B ❌; coord A→líder A ✅ / líder de outra unidade ❌; lider→equipe própria ✅ / equipe de outro ❌; super admin não vira coord; técnico/viewer negados no guard. |

### DECISÕES 8.2 (aprovadas pelo usuário)

1. **Escrita escopada via RPC** — `coordinator_set_manager(membership, manager)`: re-parenta `managed_by` nas próprias unidades; criação de memberships/cargos permanece super-admin-only (036); guarda 046 revalida estrutura.
2. **Tela real completa** — `/coordenador` deixa de ser "em construção": `CoordinatorHome` mostra unidades → lideranças → equipes (dados do RPC), estados carregando/erro/vazio honestos. **Sem CTAs falsos de gestão** (a escrita via RPC é capacidade do serviço; UI de gestão vem em fase própria).
3. **Ações de chamados fora desta fase** — seed 040 já ativo; Fase 8 foca escopo de dados + relação `managed_by`.

### FASE 8.2 — IMPLEMENTAÇÃO

- [x] **`supabase/migrations/047_rbac2_coordinator_scope.sql`** — 5 helpers SECURITY DEFINER (`search_path=public`, REVOKE anon/PUBLIC, GRANT authenticated), fail-closed por `auth.uid() + r.slug='coordinator' + status active`:
  - `is_coordinator_of(ws)` — predicado;
  - `get_coordinator_units()` — SETOF das memberships de coordenação do chamador;
  - `get_coordinator_leaders(ws)` — SETOF das memberships da unidade geridas diretamente pela membership de coordenação (escopo por `m.workspace_id = p_workspace_id` explícito);
  - `get_memberships_by_manager(manager_id)` — SETOF da equipe ativa de uma liderança (somente coordenador ativo do workspace do gestor);
  - `coordinator_set_manager(membership, manager)` — **escrita escopada**: alvo ativo e não-coordenador; chamador coordenador ativo da unidade; gestor na mesma unidade e na árvore do chamador (`= coord` OU `managed_by = coord`); `NULL` remove da equipe; `updated_at=now()`; trigger 046 revalida (sem ciclos, sem lider→lider); RLS de memberships permanece super-admin-only.
- [x] **`supabase/migrations/tests/047_coordinator_scope.sql`** — asserções estruturais/catálogo: 5 funções existentes, marcadores de fail-closed (auth.uid/cargo coordinator/escopo por workspace/tree check no write), `memberships_update` ainda super-admin-only (036), ACL anon/PUBLIC revogado. Comportamental roda no staging como sessão autenticada.
- [x] **`src/core/permissions/coordinatorService.ts`** — `getCoordinatorScope()` (unidades → lideranças → equipes via RPCs 047, join client-side em `profiles`/`workspaces`, fail-closed `[]` + `getLastCoordinatorServiceError`) e `setCoordinatorManager(id, managerId|null)` (escrita via RPC; `false` + erro se negado).
- [x] **`src/core/permissions/useCoordinator.ts`** — hook multiunidade (não depende do `workspaceStore`, ao contrário do `useTeam`): loading/failed/units/refresh; vazio legítimo ≠ erro.
- [x] **`src/platform/Coordinator/CoordinatorHome.tsx`** — tela real: resumo (unidades / lideranças diretas / membros nas equipes) + seção por unidade (lideranças e suas equipes, ou linha "Nenhuma liderança subordinada"); estados carregando / erro+retry / vazio honesto / dado real; sem CTA de gestão (só o voltar).
- [x] **Testes (21 novos/reescritos):** `coordinatorService.test.ts` (escopo completo multiunidade, RLS ocultando nome/perfil → fallback, erros → `[]` fail-closed, vazio legítimo, `setCoordinatorManager` re-parenta/NULL/negação, defaultDb null), `useCoordinator.test.tsx` (load/failed/vazio/refresh), `CoordinatorHome.test.tsx` reescrito (carregando/erro+retry/vazio/escopo real/unidade sem liderança/sem CTAs).
- [x] **Bateria:** `npm run test:run` = **202 arquivos · 1754 testes ✓ · 1 skip**; `npm run lint` = exit 0 (só warnings pré-existentes; nenhum nos arquivos novos); `npm run build` = `tsc -b && vite build` verdes.

**Próximos passos da Fase 8:** (a) UI de gestão da estrutura (vincular/remover lideranças e membros) consumindo `coordinator_set_manager`; (b) fechar o drift `workspace_ids` (legado) ↔ memberships como fonte de escopo; (c) auditoria de fechamento da Fase 8 (espelho 7.7). O mascote permanece congelado.