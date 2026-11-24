# Notifications: periodic producers (PR #527)

Existing signed QStash tick and event wakeups remain unchanged:
`{"job":"labhub-notifications","version":1}`

New fixed signed body, same production endpoint:
`{"job":"labhub-notifications-periodic","version":1}`

This body first runs the existing queue recovery and Chamados workflow dispatcher, then ReservaLab (laboratory/tablet), pending-user approval producers and one due inventory check. It does not scan on a ticket event. Queue and durable dedup are shared; if a producer creates new work a second bounded worker pass is invoked. Failures return 503 with per-producer results; one producer's exception does not suppress the other. New periodic path never falls back to an unscoped global reservation or direct synchronous Push. Reservation reminders expire at start time; pending-user notifications recheck the pending profile and active super-admin recipients at delivery.

## Rollout (not yet activated)
- CI and staging validation with fakes and authorized test devices first; signed production endpoint stays production-only.
- After production deployment is verified, update the existing 5-minute schedule body in place to the periodic body (same destination and cadence). No extra scheduled messages/day. Keep the ordinary event wakeup body unchanged. Verify execution duration and errors; restore the original schedule body immediately if periodic checks degrade critical delivery.
- Existing schedule and event wakeups are unchanged while this PR is draft. No live pushes or schedule changes.
- A 5-minute check of the 30-minute window yields nominal 25–30 minutes before start before delivery overhead when healthy, not an exact 30-minute guarantee. Worker backlog or outages can reduce lead time.
- Stock and PCare use the verified camelCase database columns and campus-scoped outbox events. The periodic body staggers checks at :00 loans, :15 parts, :30 expiry, :45 maintenance (five-minute slot windows). Each check has a 500-row cap and reports incomplete on hitting it; next hourly slot retries, with stable event IDs. No full coverage guarantee for larger inventories or missed schedule slots.
- Tablets now recheck active status, workspace and exact start time at delivery, and rescheduled starts produce a new event ID. Lab spreadsheet cancellation/rescheduling at delivery and cross-midnight reservations still require validation. No extra live notifications or schedule changes until acceptance. Pending signup Web Push is separate from private realtime approval invalidation and in-app bell; validate each path.
- No additional paid services, secrets, or database migration required for this initial increment.

## Private bell invalidation (migration 123)

A successful INSERT into public.app_notifications sends a content-free version hint to eligible personal topics. Receive-only Realtime RLS restricts each topic to its active account. The authenticated HTTP API is still the source of content; Web Push stays independent. Connected clients skip redundant 10-second polls and reconcile after five minutes without a successful read; disconnected clients retain ten-second recovery, plus visibility and online events. No production guarantee until the migration and authenticated device tests pass. The periodic approval producer now uses the existing atomic notification_create_with_outbox RPC to persist the admin-only bell entry and Push event together, deduplicated by applicant/week. Tablet and inventory events now persist an idempotent bell row from the existing worker after applicable delivery checks, without creating a second outbox. The GET API checks current campus memberships, workspace role actions and explicit overrides for these operational rows; a failed authorization query returns 503, never bypasses a deny. A successful authorized server window reconciles periodic rows in the personal cache (the latest 200 global rows currently bound the window). Lab spreadsheet reminders remain Push-only pending source revalidation. Existing non-periodic Chamados local alerts are unchanged. Legacy bell cache is no longer adopted: new reads and local dismissals use authenticated account namespaces; old stock.notifications sync is disabled. Read/dismiss state is device-local, not cross-device.

Managed rollback-only SQL smoke test: supabase/migrations/tests/123_app_notifications_private_invalidation_checks.sql. It requires two existing active QA profiles; never create accounts or send a committed test notification through it.
