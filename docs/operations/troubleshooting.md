# Troubleshooting

> Problemas recorrentes e como resolvê-los.

## Sincronização

### Dados não sincronizam entre dispositivos

**Sintomas:** alterações feitas em um dispositivo não aparecem em outro.

**Verifique:**

1. O dispositivo está online? (selo de status de sincronização)
2. A coleção está marcada como dirty? (`labhub_dirty_collections` no `localStorage`)
3. Existem erros de sincronização? (`labhub_sync_log`)
4. O usuário tem acesso ao workspace?

**Correção:**

- Acione uma sincronização manual (atualizar a lista ou recarregar a página)
- Revise as políticas de RLS no Supabase
- Confirme que `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão definidas

### Erros de sincronização no console

**Sintomas:** `[Sync] Failed to sync "nome_da_colecao"` no console.

**Causas comuns:**

- Política de RLS bloqueando o acesso
- Timeout de rede
- Divergência de schema entre local e remoto

**Correção:**

- Revise as políticas de RLS no Supabase
- Confirme que o nome da coleção corresponde ao da tabela
- Verifique o mapa de nomes de tabela em `sync.ts`

## Notificações push

### Notificações não chegam

**Sintomas:** usuários não recebem notificações push.

**Verifique:**

1. `VAPID_PUBLIC_KEY` está definida no frontend?
2. `VAPID_PRIVATE_KEY` está definida no backend?
3. O Upstash Redis está configurado?
4. O usuário concedeu permissão de notificação?

**Correção:**

- Teste com `GET /api/push/test`
- Verifique as configurações de notificação do navegador
- Confirme a conexão com o Upstash Redis

### Botões de ação não funcionam

**Sintomas:** botões "Aprovar" e "Recusar" não respondem.

**Nota:** os botões de ação só funcionam no Chrome para Android e no desktop. No iOS/Safari, a notificação apenas exibe o corpo; o clique abre a URL configurada.

## Chamados

### O número do chamado não é gerado

**Sintomas:** chamados criados sem numeração sequencial.

**Verifique:**

1. `SUPABASE_SERVICE_KEY` está definida no backend?
2. O workspace existe no Supabase?
3. A aplicação Chamados está habilitada no workspace?

**Correção:**

- Confirme as variáveis de ambiente do backend
- Verifique a resposta de `require_module()`
- Consulte os logs do Flask na Vercel

### Formulário público retornando 503

**Sintomas:** erro "Não foi possível abrir o chamado".

**Causa:** backend não configurado (falta `SUPABASE_URL` ou `SUPABASE_SERVICE_KEY`).

**Correção:** defina as variáveis de ambiente na Vercel.

## Desempenho

### Carregamento inicial lento

**Causa:** volume grande de dados no `localStorage` ou muitas coleções.

**Correção:**

- Limpe logs de sincronização antigos (`labhub_sync_log`)
- Verifique coleções muito grandes no `localStorage`
- Confirme que o carregamento sob demanda está funcionando (aba de rede)

### Consumo de memória alto

**Causa:** muitas fotos armazenadas no `localStorage`.

**Correção:**

- Fotos devem ficar no Cloudinary, não no `localStorage`
- Verifique `labhub_pcs.photos` e `labhub_stock_items.photos`
- Migre dados binários para o IndexedDB

## Relacionados

- [Deploy](deployment.md)
- [Monitoramento](monitoring.md)
- [Configuração do ambiente](../guides/setup.md)
