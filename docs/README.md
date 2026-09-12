# Documentação do LabHub

> Documentação oficial da plataforma LabHub — PWA modular para gestão de laboratórios de informática em ambientes universitários.

Esta documentação está organizada em **três blocos principais**:

- **Plataforma** — o que vale para o LabHub inteiro (arquitetura, conceitos, segurança, RBAC, infraestrutura compartilhada, decisões).
- **Aplicações** — o que é específico de cada aplicação (`chamados`, `reservalab`, `pc-care`, `stock`, `tv`).
- **Recursos transversais** — guias, operações, referência técnica, auditorias e glossário.

Ao procurar informação, a primeira pergunta é: *isto pertence à plataforma inteira ou a uma aplicação específica?*

---

## Aplicações

| Aplicação | O que faz | Documentação |
|-----------|-----------|--------------|
| **Chamados** | Abertura pública e gestão de chamados técnicos, com SLA, notificações e avaliação | [`apps/chamados/`](apps/chamados/README.md) |
| **ReservaLab** | Reserva de laboratórios e tablets, dashboard de ocupação e lembretes | [`apps/reservalab/`](apps/reservalab/README.md) |
| **PC Care** | Inventário, limpeza e manutenção preventiva de computadores | [`apps/pc-care/`](apps/pc-care/README.md) |
| **Estoque** | Materiais e suprimentos, movimentações, kits e inventário cíclico | [`apps/stock/`](apps/stock/README.md) |
| **TV** | Murais digitais: eventos, playlists de vídeo, música, avisos e galerias | [`apps/tv/`](apps/tv/README.md) |

Índice geral das aplicações: [`apps/README.md`](apps/README.md).

## Plataforma

| Área | Conteúdo | Documentação |
|------|----------|--------------|
| **Arquitetura** | Desenho do sistema, frontend, backend, camada de dados, realtime, registro de ativos | [`platform/architecture/`](platform/architecture/system.md) |
| **Conceitos** | Workspaces, aplicações, ativos, chamados, offline-first e sincronização | [`platform/concepts/`](platform/concepts/system-overview.md) |
| **Segurança** | Autenticação, ciclo de vida de usuário e modelo de autorização | [`platform/security/`](platform/security/authentication.md) |
| **RBAC 2.0** | Especificação, catálogo de Actions, enforcement e rollout | [`platform/rbac/`](platform/rbac/README.md) |
| **Decisões** | Architecture Decision Records (ADRs) | [`platform/decisions/`](platform/decisions/README.md) |

Ponto de entrada da plataforma: [`platform/README.md`](platform/README.md).

## Guias

| Guia | Descrição |
|------|-----------|
| [Configuração do ambiente](guides/setup.md) | Pré-requisitos, variáveis de ambiente e primeiro start |
| [Desenvolvimento](guides/development.md) | Estrutura do projeto, convenções e comandos |
| [Testes](guides/testing.md) | Como escrever e executar testes |
| [Criar uma nova aplicação](guides/adding-application.md) | Passo a passo para adicionar uma aplicação |
| [Migrations do banco](guides/database-migrations.md) | Criação e gestão de migrations Supabase |
| [Ambiente DEMO do Chamados](guides/chamados-demo-environment.md) | Criar, fotografar e limpar o ambiente de demonstração |

Índice: [`guides/README.md`](guides/README.md).

## Operações

| Documento | Descrição |
|-----------|-----------|
| [Deploy](operations/deployment.md) | Pipeline, checklist pré-deploy e rollback |
| [Monitoramento](operations/monitoring.md) | Métricas, health checks e alertas recomendados |
| [Troubleshooting](operations/troubleshooting.md) | Problemas recorrentes e como resolver |
| [Recuperação](operations/recovery.md) | Backup e recuperação de desastres |

Índice: [`operations/README.md`](operations/README.md).

## Referência

| Referência | Descrição |
|------------|-----------|
| [API](reference/api.md) | Endpoints do backend Flask |
| [Banco de dados](reference/database.md) | Schemas, tabelas, RLS e migrations |
| [Tipos](reference/types.md) | Tipos TypeScript compartilhados |
| [Eventos](reference/events.md) | Eventos de realtime e notificações push |
| [Configuração](reference/configuration.md) | Variáveis de ambiente, arquivos de configuração e chaves locais |

Índice: [`reference/README.md`](reference/README.md).

## Auditorias

Análises, validações e snapshots datados do sistema: [`audits/README.md`](audits/README.md).

## Glossário

Termos do domínio do LabHub (workspace, membership, Action, RBAC, chamado, reserva, ativo): [`glossary.md`](glossary.md).

---

## Precisa encontrar alguma coisa?

| Quero… | Onde encontrar |
|--------|----------------|
| Começar o desenvolvimento | [Configuração do ambiente](guides/setup.md) → [Desenvolvimento](guides/development.md) |
| Entender o que é o LabHub | [Visão geral do sistema](platform/concepts/system-overview.md) |
| Entender a plataforma por dentro | [Arquitetura](platform/architecture/system.md) → [Camada de dados](platform/architecture/data-layer.md) |
| Trabalhar no Chamados | [Chamados](apps/chamados/README.md) → [Fluxos](apps/chamados/workflows.md) → [Referência](apps/chamados/reference.md) |
| Trabalhar no ReservaLab | [ReservaLab](apps/reservalab/README.md) → [Arquitetura](apps/reservalab/architecture.md) |
| Trabalhar no PC Care | [PC Care](apps/pc-care/README.md) → [Referência](apps/pc-care/reference.md) |
| Trabalhar no Estoque | [Estoque](apps/stock/README.md) → [Referência](apps/stock/reference.md) |
| Trabalhar na TV | [TV](apps/tv/README.md) |
| Entender o RBAC | [RBAC 2.0](platform/rbac/README.md) → [Especificação](architecture/rbac2.0-specification.md) → [Catálogo de Actions](architecture/rbac2.0-actions-catalog.md) |
| Entender quem pode acessar o quê | [Autorização](platform/security/authorization.md) |
| Entender autenticação e aprovação de usuários | [Autenticação](platform/security/authentication.md) |
| Entender workspaces e isolamento | [Conceito de Workspace](platform/concepts/workspaces.md) |
| Consultar uma API ou um contrato | [Referência da API](reference/api.md) |
| Consultar o banco de dados | [Referência do banco](reference/database.md) |
| Fazer deploy | [Operações: Deploy](operations/deployment.md) |
| Investigar um problema | [Troubleshooting](operations/troubleshooting.md) → [Monitoramento](operations/monitoring.md) |
| Recuperar dados perdidos | [Recuperação](operations/recovery.md) |
| Entender um termo | [Glossário](glossary.md) |
| Saber por que algo foi decidido | [Decisões arquiteturais](platform/decisions/README.md) |
| Ver análises e validações anteriores | [Auditorias](audits/README.md) |
| Adicionar uma nova aplicação | [Criar uma nova aplicação](guides/adding-application.md) |

---

## Organização da documentação

### Plataforma × aplicações × transversal

- `platform/` reúne o que pertence ao LabHub como um todo. Nada específico de uma aplicação deve ficar aqui.
- `apps/<aplicacao>/` reúne o que é específico daquela aplicação. Cada aplicação tem seu próprio `README.md`.
- `guides/`, `operations/`, `reference/` e `audits/` reúnem conteúdo transversal, aplicável a toda a plataforma.

Adicionar uma nova aplicação não exige reorganizar a documentação das demais: basta criar `apps/<nova-aplicacao>/` com seu `README.md` e, quando houver conteúdo suficiente, subpastas próprias.

### Caminhos canônicos preservados

Alguns documentos são referenciados diretamente por código, migrations, testes e scripts, e por isso permanecem em seus caminhos originais:

```text
docs/architecture/rbac2.0-actions-catalog.md
docs/architecture/rbac2.0-specification.md
docs/modules/tv/overview.md
docs/audits/architecture/rbac2.0-rls-hardening-044-design.md
docs/audits/architecture/rbac2.0-rls-hardening-044-discovery.md
docs/chamados-demo/screenshots/
```

Esses arquivos são canônicos: não devem ser movidos, renomeados nem duplicados. A descoberta se dá por índices — por exemplo, [`platform/rbac/README.md`](platform/rbac/README.md) aponta para a especificação e para o catálogo, e [`apps/tv/README.md`](apps/tv/README.md) aponta para a visão geral da TV.

### Convenções

1. **Um assunto por documento** — cada documento responde a uma pergunta principal.
2. **Categoria correta** — conceito (o que é), arquitetura (como funciona), guia (como fazer), referência (detalhe técnico), auditoria (o que foi analisado).
3. **Documentação descreve produto, não processo** — registra fatos, decisões, arquitetura, comportamento, evidências e procedimentos.
4. **Sem arquivos vazios** — só criar um documento quando houver conteúdo real.
5. **Nomes previsíveis** — evite nomes genéricos ou datas sem contexto.
