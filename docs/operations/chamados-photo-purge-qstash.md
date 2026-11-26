# Chamados photo purge — QStash cutover

Existing GitHub schedule: 03:30 UTC / 00:30 America/Sao_Paulo. Keep it during the transition. No changes to notification ticks or retention policy.

1. Merge and verify production deployment. New signed route POST https://lab-hub-pi.vercel.app/api/chamados/photos/qstash/purge with exact body {"job":"labhub-chamados-photos-purge","version":1}. Only production and the configured production Supabase are allowed; signature binds fixed URL and body. No credentials in body or URL.
2. With LABHUB_QSTASH_PHOTO_PURGE_ENABLED unset/0, publish one signed message using QStash; verify HTTP 200, dry_run=true, zero failures, counts in logs or response. Signed explicit dry-run body {"job":"labhub-chamados-photos-dry-run","version":1} always stays read-only.
3. Create a daily schedule with cron 30 3 * * * and the exact purge body; verify destination, cadence and successful signed delivery. Activate production flag=1 and redeploy; verify signed purge, actual response, no errors. Shared Redis lease rejects overlapping destructive requests with 503 for retry.
4. Only after the above verification remove the schedule stanza in .github/workflows/photos-cleanup.yml through a separate reviewed PR. Preserve workflow_dispatch as manual recovery. Rollback: restore legacy schedule first, disable flag and redeploy, pause QStash schedule. No orphan cleanup, changes to profile assets, or changes to the other QStash schedules.

Lease TTL is 900 seconds; no cross-service transaction exists. Keep existing bounded batch and retention checks. First live scheduled execution and delivery logs must be monitored separately from HTTP unit tests.

## Read budget

Two paginated reads for an empty/small scan: nonempty ticket photo references, then nonempty/non-`[]` event photo references with embedded parent ticket via `ticket_events_ticket_id_fkey`. Do not filter by terminal status at the database level: active references must protect shared assets. Missing or inconsistent parent snapshots fail closed. Eligibility and pre-delete checks remain unchanged. `tickets_scanned` counts eligible referenced parents, not every terminal ticket. Additional reads and patches depend on eligible assets and page count.
