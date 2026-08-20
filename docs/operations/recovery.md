# Recovery

> Disaster recovery and data backup procedures.

## Data Backup Strategy

### Supabase (Remote)

Supabase provides automatic daily backups (plan-dependent). For additional safety:

1. **Supabase Dashboard** → Database → Backups → Download backup
2. **pg_dump** for manual backups:
   ```bash
   pg_dump $DATABASE_URL > labhub_backup_$(date +%Y%m%d).sql
   ```

### localStorage (Local)

Each user's data is in their browser's localStorage. The app provides manual export:

1. Go to Settings → Backup
2. Click "Exportar dados" (downloads JSON file)
3. To restore: Settings → Importar dados

### Workspace Backup

Admins can backup entire workspaces:
1. Go to `/admin/backups`
2. Select workspace
3. Export (includes all workspace data)
4. Restore from backup file (2-day retention for deleted workspaces)

## Recovery Scenarios

### Scenario 1: Corrupted localStorage

**Impact:** User can't access local data.

**Recovery:**
1. Clear localStorage for the domain
2. Re-login (data syncs from Supabase)
3. If sync data is also corrupted, restore from Supabase backup

### Scenario 2: Supabase outage

**Impact:** No sync, no real-time, no public ticket creation.

**Recovery:**
- App continues working offline (localStorage)
- When Supabase recovers, sync resumes automatically
- Public form returns 503 (expected)

### Scenario 3: Vercel outage

**Impact:** App and API unavailable.

**Recovery:**
- Wait for Vercel to recover
- No data loss (Supabase is independent)
- Local data preserved in user browsers

### Scenario 4: Accidental data deletion

**Impact:** Data removed from Supabase.

**Recovery:**
1. Check Supabase point-in-time recovery (Pro plan)
2. Restore from latest backup
3. Local data may have stale copies that can be re-synced

### Scenario 5: Bad deployment

**Impact:** App broken after deploy.

**Recovery:**
1. Vercel Dashboard → Deployments
2. Find last working deployment
3. "Promote to Production"
4. No data impact (frontend only)

## RTO and RPO

| Scenario | RTO | RPO |
|----------|-----|-----|
| localStorage corruption | 5 min | Last sync |
| Supabase outage | Hours (vendor) | Last backup |
| Vercel outage | Minutes (vendor) | Zero (static) |
| Bad deployment | 2 min | Zero |

## Related

- [Operations: Deployment](deployment.md)
- [Operations: Troubleshooting](troubleshooting.md)
