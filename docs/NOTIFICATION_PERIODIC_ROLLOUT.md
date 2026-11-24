# Notifications: periodic producers (PR #527)

Existing signed QStash tick and event wakeups remain unchanged:
`{"job":"labhub-notifications","version":1}`

New fixed signed body, same production endpoint:
`{"job":"labhub-notifications-periodic","version":1}`

This body first runs the existing queue recovery and Chamados workflow dispatcher, then ReservaLab (laboratory/tablet) and pending-user approval producers. It does not scan on a ticket event. Queue and durable dedup are shared; if a producer creates new work a second bounded worker pass is invoked. Failures return 503 with per-producer results; one producer's exception does not suppress the other. New periodic path never falls back to an unscoped global reservation or direct synchronous Push. Reservation reminders expire at start time; pending-user notifications recheck the pending profile and active super-admin recipients at delivery.

## Rollout (not yet activated)
- CI and staging validation with fakes and authorized test devices first; signed production endpoint stays production-only.
- After production deployment is verified, update the existing 5-minute schedule body in place to the periodic body (same destination and cadence). No extra scheduled messages/day. Keep the ordinary event wakeup body unchanged. Verify execution duration and errors; restore the original schedule body immediately if periodic checks degrade critical delivery.
- Existing schedule and event wakeups are unchanged while this PR is draft. No live pushes or schedule changes.
- A 5-minute check of the 30-minute window yields nominal 25–30 minutes before start before delivery overhead when healthy, not an exact 30-minute guarantee. Worker backlog or outages can reduce lead time.
- Audit stock/PCare workspace targeting and due-time semantics before activating their producers. Review reservation cancellation/rescheduling between enqueue and delivery and cross-midnight reservations. Pending signup Web Push is separate from private realtime approval invalidation and in-app bell; validate each path.
- No additional paid services, secrets, or database migration required for this initial increment.
