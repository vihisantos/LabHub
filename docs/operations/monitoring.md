# Monitoramento

> Como acompanhar o LabHub em produção.

## Métricas principais

### Aplicação

- **Status do deploy** — Vercel Dashboard
- **Taxa de sucesso do build** — GitHub Actions
- **Taxa de erro** — erros no console do navegador

### Banco de dados

- **Desempenho de consultas** — Supabase → Database → Query Performance
- **Número de conexões** — Supabase → Database → Connection Pool
- **Violações de RLS** — Supabase → Auth → Logs

### Backend

- **Duração das funções** — Vercel → Functions
- **Erros das funções** — Vercel → Functions → Logs
- **Tempo de cold start** — Vercel → Functions → Metrics

### Notificações push

- **Taxa de entrega** — painel do Upstash Redis
- **Número de inscrições** — chaves `push_subscribers:*` no Redis

### RBAC 2.0 (quando `RBAC_2_ENABLED=1`)

| Métrica | Onde observar | O que vigiar |
|---------|---------------|--------------|
| Volume do log de auditoria | Tabela `rbac_audit_logs` | Picos incomuns de negações ou de registros |
| Taxa de negação por Action | Consulta a `rbac_audit_logs` | Aumento repentino de 403 em uma Action específica |
| Falhas de auditoria | Logs do backend | Erros em `record_rbac_audit` (melhor esforço, não bloqueante) |
| Total de memberships | Tabela `memberships` | Deve corresponder ao número esperado de usuários |
| Total de overrides | Tabela `membership_overrides` | Deve permanecer em zero sem concessão manual |

#### Consulta: taxa de negação por Action (últimas 24 horas)

```sql
SELECT action, COUNT(*) as denies
FROM rbac_audit_logs
WHERE effect = 'deny'
  AND "timestamp" > now() - interval '24 hours'
GROUP BY action
ORDER BY denies DESC;
```

#### Consulta: proporção entre permissões e negações

```sql
SELECT
  effect,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as pct
FROM rbac_audit_logs
WHERE "timestamp" > now() - interval '24 hours'
GROUP BY effect;
```

## Health checks

### API

```bash
curl https://lab-hub-pi.vercel.app/api/health
```

### Supabase

Verifique em Supabase → Settings → API → Health.

## Alertas

Hoje não há alertas automatizados; o acompanhamento é manual, pelos painéis.

### Alertas recomendados

- Falha de deploy
- Taxa de erro da API acima de 5%
- Pool de conexões do banco acima de 80%
- Entrega de push abaixo de 90%
- **Taxa de negação do RBAC acima de 20%** — possível erro de configuração ou tentativa de abuso
- **Falhas de escrita no log de auditoria do RBAC** — lacuna de observabilidade

## Logs

| Origem | Onde | Retenção |
|--------|------|----------|
| Funções Vercel | Vercel → Functions → Logs | 3 dias (plano gratuito) / 30 dias (pago) |
| Supabase | Supabase → Logs | 7 dias |
| GitHub Actions | Actions → Execuções | 90 dias |
| Auditoria do RBAC | Tabela `rbac_audit_logs` | Indefinida (append-only) |
| Erros do cliente | Console do navegador | Apenas a sessão |

## Relacionados

- [Deploy](deployment.md)
- [Troubleshooting](troubleshooting.md)
- [Autorização](../platform/security/authorization.md)
