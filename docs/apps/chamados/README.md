# Chamados

> Chamados técnicos e ordens de serviço para os laboratórios de informática.

**Rota:** `/chamados` (painel de TI) e `/chamados-publico` (formulário público)
**Cor:** `#f59e0b` (âmbar)
**Código:** `src/apps/chamados`, `src/apps/chamados-publico`, `src/apps/chamados-dashboard`

## Propósito

O Chamados centraliza as solicitações de suporte e ordens de serviço de TI. Ele conecta professores que relatam problemas a técnicos que os resolvem, com acompanhamento de todo o ciclo de vida e monitoramento de SLA.

## O que resolve

- Abertura de chamado sem burocracia, por QR Code ou link, sem exigir login do professor
- Canal único para a equipe de TI filtrar, atribuir e resolver solicitações
- Controle de prazos por prioridade
- Histórico completo do atendimento, com comentários e anexos
- Avaliação do atendimento pelo professor ao final

## Principais funcionalidades

- **Abertura pública** — professores enviam chamados por QR Code ou link, sem autenticação
- **Painel de TI** — filtro, atribuição, atualização e resolução de chamados
- **Controle de SLA** — prazos de resposta e resolução por prioridade
- **Atualizações em tempo real** — mudanças de status chegam ao professor na hora
- **Avaliação** — nota de 1 a 5 estrelas após a resolução
- **Notificações push** — avisos automáticos de novo chamado e de mudança de status
- **Fotos** — anexos enviados via Cloudinary (máximo de 600 KB)
- **Relatórios** — exportação em CSV, XLSX e PDF, com agregação por técnico
- **Operações em lote** — arquivar, atribuir e alterar prioridade ou status em vários chamados

## Atores

| Ator | Nível de acesso | O que pode fazer |
|------|-----------------|------------------|
| Professor (público) | Não autenticado | Abrir chamado, acompanhar status e avaliar o atendimento |
| Técnico | `technician` ou `admin` | Ver e atualizar chamados, comentar, resolver |
| Admin | `admin` ou `super_admin` | Tudo acima, mais atribuir técnicos e gerenciar SLA |

## Onde está a documentação

| Documento | Conteúdo |
|-----------|----------|
| [Arquitetura](architecture.md) | Componentes, estado, fluxo de dados e estrutura de arquivos |
| [Fluxos](workflows.md) | Passo a passo dos fluxos de uso |
| [Referência](reference.md) | Tipos, endpoints, SLA, componentes, hooks, serviços e chaves locais |
| [Referência da API](../../reference/api.md) | Contrato completo dos endpoints do backend |
| [Auditoria: fluxo de feedback do professor](../../audits/features/chamados-feedback-professor-audit.md) | Análise do fluxo de avaliação |
| [Validação: pipeline de push e feedback](../../audits/features/chamados-push-pipeline-validation.md) | Validação ponta a ponta do pipeline |
| [Ambiente DEMO](../../guides/chamados-demo-environment.md) | Como criar, fotografar e limpar o ambiente de demonstração |

## Integrações e dependências

- **Núcleo:** autenticação, permissões, workspaces, notificações
- **Bibliotecas:** ícones, gráficos, hooks (incluindo `useRealtimeSubscription`)
- **API:** backend Flask (`/api/chamados*`)
- **Externos:** Cloudinary (fotos) e Supabase Realtime

**Não há importações de outras aplicações.** O módulo funciona de forma independente: chamados sem `assetId`/`assetSource` operam normalmente; salas vêm da coleção local `rooms`, as categorias de `problem_templates` e a configuração de SLA de `sla_configs`.
