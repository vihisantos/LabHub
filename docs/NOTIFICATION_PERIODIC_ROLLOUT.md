# Notifications: periodic producers (PR #527)

Existing signed QStash tick and event wakeups remain unchanged:
`{"job":"labhub-notifications","version":1}`

New fixed signed body, same production endpoint:
`{"job":"labhub-notifications-periodic","version":1}`

This body runs only ReservaLab (laboratory/tablet) and pending-user approval producers. It does not scan on a ticket event. Queue and durable dedup are shared; if a producer creates new work the existing worker is invoked, otherwise the ordinary tick continues to recover queued work. Failures return 503 with per-producer results; one producer's exception does not suppress the other. New periodic path never falls back to an unscoped global reservation or direct synchronous Push. Reservation reminders expire at start time; pending-user notifications recheck the pending profile and active super-admin recipients at delivery.

## Rollout (not yet activated)
- CI and staging validation with fakes and authorized test devices first; signed production endpoint stays production-only.
- Verify QStash usage and limits before creating a 5-minute schedule for the periodic body. This would add 288 scheduled messages/day; do not assume that budget is free/available.
- Existing schedule and event wakeups are unchanged. No live pushes or schedule changes from this PR while draft.
- A 5-minute check of the 30-minute window yields nominal 25–30 minutes before start when healthy, not an exact 30-minute guarantee. Worker backlog or outages can reduce lead time.
- Audit stock/PCare workspace targeting and due-time semantics before activating their producers. Review reservation cancellation/rescheduling between enqueue and delivery and cross-midnight reservations. Pending signup Web Push is separate from private realtime approval invalidation and in-app bell; validate each path.
- No additional paid services, secrets, or database migration required for this initial increment.
