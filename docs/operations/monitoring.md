# Monitoring

> How to monitor LabHub in production.

## Key Metrics

### Application
- **Deployment status** — Vercel Dashboard
- **Build success rate** — GitHub Actions
- **Error rate** — Browser console errors

### Database
- **Query performance** — Supabase Dashboard → Database → Query Performance
- **Connection count** — Supabase Dashboard → Database → Connection Pool
- **RLS violations** — Supabase Dashboard → Auth → Logs

### Backend
- **Function duration** — Vercel Dashboard → Functions
- **Function errors** — Vercel Dashboard → Functions → Logs
- **Cold start time** — Vercel Dashboard → Functions → Metrics

### Push Notifications
- **Delivery rate** — Upstash Redis dashboard
- **Subscription count** — Redis `push_subscribers:*` keys

### RBAC 2.0 (when `RBAC_2_ENABLED=1`)

| Metric | Where | What to watch |
|--------|-------|---------------|
| Audit log volume | `rbac_audit_logs` table | Unusual spikes in DENY or total rows |
| DENY rate by action | Query `rbac_audit_logs` | Sudden increase in 403s for a specific action |
| Audit log failures | Backend logs | `record_rbac_audit` errors (best-effort, non-blocking) |
| Membership count | `memberships` table | Should match expected user count |
| Override count | `membership_overrides` table | Should be 0 unless manually granted |

#### Query: DENY rate by action (last 24h)
```sql
SELECT action, COUNT(*) as denies
FROM rbac_audit_logs
WHERE effect = 'deny'
  AND "timestamp" > now() - interval '24 hours'
GROUP BY action
ORDER BY denies DESC;
```

#### Query: ALLOW vs DENY ratio
```sql
SELECT
  effect,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as pct
FROM rbac_audit_logs
WHERE "timestamp" > now() - interval '24 hours'
GROUP BY effect;
```

## Health Checks

### API Health
```bash
curl https://lab-hub-pi.vercel.app/api/health
```

### Supabase Health
Check Supabase Dashboard → Settings → API → Health

## Alerting

Currently no automated alerting. Manual monitoring via dashboards.

### Recommended Alerts
- Deployment failure
- API error rate > 5%
- Database connection pool > 80%
- Push notification delivery < 90%
- **RBAC DENY rate > 20%** (possible misconfiguration or attack)
- **RBAC audit log write failures** (observability gap)

## Logs

| Source | Location | Retention |
|--------|----------|-----------|
| Vercel Functions | Dashboard → Functions → Logs | 3 days (free) / 30 days (pro) |
| Supabase | Dashboard → Logs | 7 days |
| GitHub Actions | Actions → Workflow runs | 90 days |
| RBAC Audit | `rbac_audit_logs` table | Indefinite (append-only) |
| Client errors | Browser console | Session only |

## Related

- [Operations: Deployment](deployment.md)
- [Operations: Troubleshooting](troubleshooting.md)
- [Architecture: Authorization](../architecture/authorization.md)
