# Recuperação

> Procedimentos de backup e recuperação de desastres.

## Estratégia de backup

### Supabase (remoto)

O Supabase faz backups automáticos diários, conforme o plano contratado. Para segurança adicional:

1. **Supabase → Database → Backups** e baixe o backup
2. **`pg_dump`** para backups manuais:

   ```bash
   pg_dump $DATABASE_URL > labhub_backup_$(date +%Y%m%d).sql
   ```

### localStorage (local)

Os dados de cada usuário ficam no navegador. A aplicação oferece exportação manual:

1. Acesse Configurações → Backup
2. Clique em "Exportar dados" (baixa um arquivo JSON)
3. Para restaurar: Configurações → Importar dados

### Backup de workspace

Admins podem fazer backup de workspaces inteiros:

1. Acesse `/admin/backups`
2. Selecione o workspace
3. Exporte (inclui todos os dados do workspace)
4. Restaure a partir do arquivo de backup — workspaces excluídos ficam disponíveis por 2 dias

## Cenários de recuperação

### Cenário 1 — localStorage corrompido

**Impacto:** o usuário não acessa os dados locais.

**Recuperação:**

1. Limpe o `localStorage` do domínio
2. Faça login novamente (os dados sincronizam do Supabase)
3. Se os dados remotos também estiverem corrompidos, restaure um backup do Supabase

### Cenário 2 — indisponibilidade do Supabase

**Impacto:** sem sincronização, sem realtime e sem abertura pública de chamados.

**Recuperação:**

- A aplicação continua funcionando offline, com o `localStorage`
- Quando o Supabase volta, a sincronização é retomada automaticamente
- O formulário público responde 503 enquanto durar a indisponibilidade — comportamento esperado

### Cenário 3 — indisponibilidade da Vercel

**Impacto:** aplicação e API indisponíveis.

**Recuperação:**

- Aguarde o restabelecimento da Vercel
- Não há perda de dados: o Supabase é independente
- Os dados locais permanecem nos navegadores dos usuários

### Cenário 4 — exclusão acidental de dados

**Impacto:** dados removidos do Supabase.

**Recuperação:**

1. Verifique a recuperação point-in-time do Supabase (plano Pro)
2. Restaure o backup mais recente
3. Dados locais podem conter cópias defasadas que voltam a sincronizar

### Cenário 5 — deploy defeituoso

**Impacto:** aplicação quebrada após a publicação.

**Recuperação:**

1. Abra a Vercel → Deployments
2. Localize o último deploy funcional
3. Clique em "Promote to Production"
4. Não há impacto em dados (mudança apenas de frontend)

## RTO e RPO

| Cenário | RTO | RPO |
|---------|-----|-----|
| Corrupção de localStorage | 5 minutos | Última sincronização |
| Indisponibilidade do Supabase | Horas (depende do fornecedor) | Último backup |
| Indisponibilidade da Vercel | Minutos (depende do fornecedor) | Zero (estático) |
| Deploy defeituoso | 2 minutos | Zero |

## Relacionados

- [Deploy](deployment.md)
- [Troubleshooting](troubleshooting.md)
- [Migrations do banco](../guides/database-migrations.md)
