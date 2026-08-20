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

## Health Checks

### API Health
```bash
curl https://lab-hub-pi.vercel.app/api/health
```

### Supabase Health
Check Supabase Dashboard → Settings → API → Health

## Alerting

Currently no automated alerting. Manual monitoring via dashboards.

### Recommended Future Alerts
- Deployment failure
- API error rate > 5%
- Database connection pool > 80%
- Push notification delivery < 90%

## Logs

| Source | Location | Retention |
|--------|----------|-----------|
| Vercel Functions | Dashboard → Functions → Logs | 3 days (free) / 30 days (pro) |
| Supabase | Dashboard → Logs | 7 days |
| GitHub Actions | Actions → Workflow runs | 90 days |
| Client errors | Browser console | Session only |

## Related

- [Operations: Deployment](deployment.md)
- [Operations: Troubleshooting](troubleshooting.md)
