# TV — Visão geral da aplicação

> Canal corporativo e murais digitais.

**Rota:** `/tv`
**Cor:** `#ef4444` (vermelho)

> Este documento é **canônico**: é referenciado por código, migrations e testes, e por isso permanece neste caminho. O índice da aplicação está em [`../../apps/tv/README.md`](../../apps/tv/README.md).

## Propósito

A TV alimenta os murais digitais dos laboratórios, exibindo eventos, vídeos, música e avisos. Opera em dois modos: **admin**, para gestão de conteúdo, e **display**, para reprodução em tela cheia.

## Principais funcionalidades

- **Gestão de eventos** — criar, editar e ativar eventos do campus; um evento pode ser direcionado a uma TV específica (`tv_events.device_id`) ou a todo o campus (`NULL`, exibido em todas). O ReservaLab cria um evento de reserva diretamente para uma TV escolhida.
- **Playlists de vídeo** — integração com o YouTube, com busca de metadados
- **Filas de música** — áudio em segundo plano para os displays
- **Avisos** — mensagens em rolagem
- **Alertas urgentes** — mensagens de emergência por severidade
- **Galerias de fotos** — carrosséis de imagens
- **Gestão de dispositivos** — códigos de ativação para as TVs

## Modo display

Apresentação em tela cheia com:

- Carrossel de eventos com transições
- Player de vídeo do YouTube
- Player de música com controle de volume
- Áudio de fundo
- Layout otimizado para resoluções de TV

## Fonte de dados

- **Acesso direto ao Supabase**, sem sincronização local
- Tabelas: `tv_events`, `tv_playlists`, `tv_music_*`, `tv_announcements`, `tv_galleries` etc.
- API do YouTube para metadados de vídeo

## Configurações por workspace (`workspace_app_settings`)

A TV registra `settings` e `SettingsPanel` no catálogo de aplicações. Admins configuram por workspace em **Workspace → Apps → TV → Gerenciar → Configurar** (`TvSettingsPanel`). As configurações são lidas e gravadas diretamente pelo frontend via RLS do Supabase (`workspace_app_settings`, migration 031) — **não há CRUD de configuração no Flask**.

Estrutura (`app_id = 'tv'`): `eventSource` (habilitado/tipo/URL/nome da aba), `period` (semestre/data final), `display` (`refreshIntervalSeconds`, `weatherCities`, `tickerLabel`) e `syncedAt`. A validação é estrita e vive em `src/apps/tv/settings/definition.ts`; os padrões são seguros (fonte desabilitada, atualização a cada 300 s). Nenhum valor específico de campus é fixado como padrão global.

## Fonte externa de eventos — Excel/SharePoint (fase 1)

**Estratégia da fase 1: link anônimo de compartilhamento do SharePoint/OneDrive** (`?download=1` quando aplicável). Credenciais da Microsoft nunca ficam no frontend; um fluxo futuro com Graph e permissão de aplicação para arquivos privados seria uma fase separada e aditiva.

Fluxo ("Testar fonte agora"):

```text
Interface admin (TvSettingsPanel)
  → POST /api/tv/source/fetch   (Bearer JWT; o workspace_id apenas seleciona QUAL
                                 membership é validada — nunca é autoridade)
  → @require_auth @require_workspace @require_module('tv')
  → o servidor lê workspace_app_settings de g.workspace_id (chave de serviço)
  → validação de SSRF (ver abaixo) → download no servidor → parsing com openpyxl
  → normalização + externalId determinístico (sha256 de título|data|fim|local)
  → resposta de pré-visualização { ok, freshness, events[], validCount, ignoredCount, syncedAt }
```

Nada é persistido em `tv_events` nesta fase — não há importação automática. A distinção futura é entre eventos manuais e eventos externos com importação idempotente (usando `externalId`).

### Proteção contra SSRF (no servidor, em profundidade)

Implementada em `api/app.py` (`_tv_validate_source_url` / `_tv_fetch_source_bytes`), reaproveitando `_is_safe_url` do ReservaLab com camadas adicionais exigidas pela TV:

1. Somente HTTPS; limite de 2048 caracteres na URL; allow-list de esquemas.
2. `_is_safe_url`: bloqueia localhost, 127.0.0.1, ::1, `.local`, IPs privados literais, loopback, link-local (incluindo 169.254.169.254), reservados e multicast.
3. Resolução de DNS: **todos** os endereços resolvidos precisam ser públicos, o que bloqueia *rebinding* de hostname para IP privado.
4. Tratamento manual de redirecionamentos, com no máximo 3 saltos; cada salto é revalidado de ponta a ponta.
5. Timeouts de 10 s para conexão e 30 s para leitura; download limitado a 8 MB.

### Cache

Padrão reaproveitado do ReservaLab: Redis primeiro, arquivo como fallback. A chave é `tv_source_{workspace_id}_{hash(eventSource)}` — sempre escopada por workspace, e qualquer alteração na configuração da fonte rotaciona a chave naturalmente (invalidação). O TTL é o `refreshIntervalSeconds` limitado à faixa de 60 a 3600 s, de modo que o usuário não consegue configurar um TTL ilimitado. Dentro do TTL, as respostas vêm do cache sem tocar a rede; em caso de falha na busca, o último resultado válido é servido com `freshness: "stale"`, permitindo à interface informar "Não foi possível atualizar. Exibindo última sincronização válida.".

## Relacionados

- [Índice da aplicação TV](../../apps/tv/README.md)
- [Arquitetura de backend](../../platform/architecture/backend.md)
- [Referência da API](../../reference/api.md)
