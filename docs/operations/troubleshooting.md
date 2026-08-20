# Troubleshooting

> Common issues and their solutions.

## Sync Issues

### Data not syncing between devices

**Symptoms:** Changes on one device don't appear on another.

**Check:**
1. Is the device online? (check sync status badge)
2. Is the collection dirty? (check `labhub_dirty_collections` in localStorage)
3. Are there sync errors? (check `labhub_sync_log`)
4. Does the user have access to the workspace?

**Fix:**
- Trigger manual sync (pull-to-refresh or reload)
- Check Supabase RLS policies
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set

### Sync errors in console

**Symptoms:** `[Sync] Failed to sync "collection_name"` in console.

**Common causes:**
- RLS policy blocking access
- Network timeout
- Schema mismatch (local vs remote)

**Fix:**
- Check RLS policies in Supabase Dashboard
- Verify collection name matches table name
- Check `TABLE_NAME_MAP` in `sync.ts`

## Push Notifications

### Notifications not arriving

**Symptoms:** Users don't receive push notifications.

**Check:**
1. Is `VAPID_PUBLIC_KEY` set in frontend?
2. Is `VAPID_PRIVATE_KEY` set in backend?
3. Is Upstash Redis configured?
4. Has the user granted notification permission?

**Fix:**
- Test with `/api/push/test`
- Check browser notification settings
- Verify Upstash Redis connection

### Notification actions not working

**Symptoms:** Aprovar/Recusar buttons don't respond.

**Note:** Action buttons only work on Android Chrome and desktop. iOS/Safari only shows the notification body (click opens URL).

## Chamados

### Ticket number not generating

**Symptoms:** Tickets created without sequential numbers.

**Check:**
1. Is `SUPABASE_SERVICE_KEY` set in backend?
2. Does the workspace exist in Supabase?
3. Is the Chamados module enabled for the workspace?

**Fix:**
- Verify backend env vars
- Check `require_module()` response
- Look at Flask logs in Vercel Dashboard

### Public form returning 503

**Symptoms:** "Não foi possível abrir o chamado" error.

**Cause:** Backend not configured (missing `SUPABASE_URL` or `SUPABASE_SERVICE_KEY`).

**Fix:** Set environment variables in Vercel Dashboard.

## Performance

### Slow initial load

**Cause:** Large localStorage data or many collections.

**Fix:**
- Clear old sync logs (`labhub_sync_log`)
- Check for large collections in localStorage
- Verify lazy loading is working (check network tab)

### High memory usage

**Cause:** Large photo data in localStorage.

**Fix:**
- Photos should use Cloudinary, not localStorage
- Check `labhub_pcs.photos` and `labhub_stock_items.photos`
- Move to IndexedDB for binary data

## Related

- [Operations: Deployment](deployment.md)
- [Guides: Setup](../guides/setup.md)
