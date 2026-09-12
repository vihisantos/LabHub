# Referência de configuração

> Arquivos de configuração, variáveis de ambiente e chaves locais.

## Variáveis de ambiente

### Frontend (Vite)

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `VITE_SUPABASE_URL` | Não | — | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Não | — | Chave anônima do Supabase |
| `VITE_APP_VERSION` | Não | — | Versão exibida nas configurações |
| `VITE_RESERVALAB_API_URL` | Não | `/api` | URL base da API Flask |
| `VITE_VAPID_PUBLIC_KEY` | Não | — | Chave pública de Web Push |
| `VITE_CLOUDINARY_CLOUD_NAME` | Não | — | Nome da conta Cloudinary |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Não | — | Preset de upload do Cloudinary |

> Sem as variáveis do Supabase, a aplicação roda em modo somente local.

### Backend (Flask)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Sim | Chave de serviço (ignora RLS) |
| `RBAC_2_ENABLED` | Não | Liga o RBAC 2.0 (`1` = ligado; padrão desligado) |
| `UPSTASH_REDIS_REST_URL` | Não | URL do Redis para push e cache |
| `UPSTASH_REDIS_REST_TOKEN` | Não | Token do Redis |
| `VAPID_PUBLIC_KEY` | Não | Chave pública de Web Push |
| `VAPID_PRIVATE_KEY` | Não | Chave privada de Web Push |
| `CRON_SECRET` | Sim | Protege os endpoints de cron |
| `YOUTUBE_API_KEY` | Sim (TV) | YouTube Data API v3 |
| `SHAREPOINT_URL` | Não | Planilha de reservas de fallback (legado) |
| `SPREADSHEET_URL_<SLUG>` | Não | Preenche `workspaces.spreadsheet_url` em lote |
| `PUSH_ADVANCE_MINUTES` | Não | Janela de aviso de reserva (padrão 30) |
| `PUSH_DEDUP_SECONDS` | Não | Janela de deduplicação de push (padrão 7200) |
| `PUSH_TABLET_RETENTION_DAYS` | Não | Retenção de reservas de tablet canceladas (padrão 30) |
| `RESEND_API_KEY` | Não | Chave do Resend para e-mails |
| `EMAIL_FROM` | Não | Remetente dos e-mails (padrão `LabHub <labhub@resend.dev>`) |
| `REPORT_EMAIL_TO` | Não | Destinatário padrão do resumo semanal |

## Arquivos de configuração

### TypeScript

| Arquivo | Propósito |
|---------|-----------|
| `tsconfig.json` | Configuração raiz, com referências |
| `tsconfig.app.json` | Código da aplicação |
| `tsconfig.node.json` | Ferramentas de build |

### Build e deploy

| Arquivo | Propósito |
|---------|-----------|
| `vite.config.ts` | Configuração principal do Vite |
| `vite.desktop.config.ts` | Configuração do build do desktop |
| `vercel.json` | Builds, rotas, cabeçalhos e cron do deploy |

### Qualidade

| Arquivo | Propósito |
|---------|-----------|
| `.oxlintrc.json` | Configuração do oxlint |
| `.github/workflows/ci.yml` | Esteira de integração contínua |

### PWA

| Arquivo | Propósito |
|---------|-----------|
| `public/manifest.webmanifest` | Manifesto da PWA |
| `src/sw.ts` | Service worker da aplicação, incluindo o tratamento de eventos `push` e `notificationclick` |

## Chaves no localStorage

| Chave | Conteúdo |
|-------|----------|
| `labhub_pcs` | Dados do PC Care |
| `labhub_parts` | Peças do PC Care |
| `labhub_stock_items` | Itens do Estoque |
| `labhub_stock_movements` | Movimentações do Estoque |
| `labhub_chamados` | Cache de chamados |
| `labhub_workspaces` | Dados de workspaces |
| `labhub_dirty_collections` | Coleções com sincronização pendente |
| `labhub_deleted_ids` | Tombstones para propagação |
| `labhub_sync_log` | Histórico de sincronizações |
| `pcare_theme` | Tema do PC Care |
| `stock_theme` | Tema do Estoque |
| `tv_theme` | Tema da TV |
| `*_workspace_id` | Workspace ativo por aplicação |

## Relacionados

- [Configuração do ambiente](../guides/setup.md)
- [Deploy](../operations/deployment.md)
- [Arquitetura de backend](../platform/architecture/backend.md)
