# Migration delivery: pre-merge staging (free-plan workflow)

No paid environment, new secret, or GitHub plan upgrade is required. Keep the existing staging and production credentials separate, and review each trusted internal PR before merging. Staging jobs reference only staging credentials. Production jobs remain restricted by workflow conditions to a push on main after release attestation.

Repository-level secrets are not a branch-level security boundary: someone able to modify a trusted internal workflow could reference production secrets. Do not run untrusted internal PR code with these credentials. Restrict write access, review workflow changes before execution where possible, and use a protected credential broker or branch-restricted environment if stronger isolation is needed later. The connector cannot inspect or change repository protection or secret settings.

Require `Staging pre-merge gate` and existing CI checks through branch protection if available; otherwise enforce the same checks and up-to-date main base manually in the release review. No direct pushes or bypasses. Verify Vercel Preview against staging before merge; production deployment on Vercel is independent of this migration gate.

## Shared staging discipline

- One unmerged SQL candidate at a time. A reservation binds version, filename and SHA-256, and a successful integration/health run records verification.
- A new reservation requires current main HEAD and a successful main production migration job for that exact SHA. An unfinished or failed promotion blocks the next candidate.
- Do not stack another migration on top of a reserved, unmerged candidate. Do not merge an unrelated PR while a different SQL candidate is staged: shared staging may otherwise block the post-merge release gate.
- If a candidate is abandoned or its SQL must change, stop delivery and review the staging schema/history/reservations together. Prefer restoring a known-good staging baseline from backup or an explicitly reviewed reconciliation; never delete only the fingerprint, silently edit migration history, or reset staging automatically.
- Failed PR validation blocks merging. On main, the release gate still verifies staging attestation and main HEAD; migrations are pending-only, never from scratch.

## Snapshot cache safety

Operational queue reconciliation requests a full snapshot from the backend. The backend confirms completeness only when its unfiltered authorized query has an exact total equal to the returned rows. Partial/truncated/legacy responses remain additive, preserving cache; concurrent local writes are protected. Pagination/incremental synchronization remains the next step for queues exceeding the server row cap. The app does not have a durable per-ticket offline PATCH retry queue today.
