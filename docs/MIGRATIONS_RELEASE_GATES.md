# Migration delivery: pre-merge staging and production isolation

## Required repository settings (owner action)

Before merging the first PR using this policy:

1. In Settings → Environments, create `production-migrations`. Under deployment branches/tags, select **Selected branches and tags**, allow only the **branch** `main` (not a tag). No manual reviewers/wait timer are required.
2. Copy the existing production-only secrets into that environment: `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `BASELINE_VERSION`. Create the environment-only secret `SUPABASE_PRODUCTION_ENV_READY` with value `1`. Configure `SUPABASE_ALLOWED_PROJECT_REFS` as an environment variable with the expected production project ref.
3. Remove the production credential copies from repository/organization-level secrets accessible to PR workflows. Verify dependent workflows before removing anything; do not paste tokens in issues, logs, or chat. Rotate previously shared credentials if necessary. Keep staging credentials scoped to the staging account/project; a project-ref allowlist is not a substitute for token privileges.
4. In Settings → Branches or Rulesets, require pull requests, require `Staging pre-merge gate` and the existing CI checks, require branches to be up to date, disallow direct pushes/bypasses (including administrators where supported). The pre-merge check appears for all PRs; ordinary app-only PRs take the lightweight path.
5. Confirm the Vercel Preview uses staging and test it before merging. Vercel automatic production deployments are independent of this migration gate; the release coordinator must ensure backwards-compatible migrations and verify production delivery.

The GitHub integration cannot configure or inspect these settings. Environment secrets and deployment branch restrictions in private repositories require GitHub Pro/Team/Enterprise. If the plan does not support them, do not add the production sentinel as a repository secret or bypass the gate. Keep the PR draft and choose a protected credential-broker/deployment alternative. No paid upgrade is assumed.

## Shared staging discipline

- One unmerged SQL candidate at a time. A reservation binds version, filename and SHA-256, and a successful integration/health run records verification.
- A new reservation requires current main HEAD and a successful main production migration job for that exact SHA. An unfinished or failed promotion blocks the next candidate.
- Do not stack another migration on top of a reserved, unmerged candidate. Do not merge an unrelated PR while a different SQL candidate is staged: shared staging may otherwise block the post-merge release gate.
- If a candidate is abandoned or its SQL must change, stop delivery and review the staging schema/history/reservations together. Prefer restoring a known-good staging baseline from backup or an explicitly reviewed reconciliation; never delete only the fingerprint, silently edit migration history, or reset staging automatically.
- Failed PR validation blocks merging. On main, the release gate still verifies staging attestation and main HEAD; migrations are pending-only, never from scratch.

## Snapshot cache safety

Operational queue reconciliation requests a full snapshot from the backend. The backend confirms completeness only when its unfiltered authorized query has an exact total equal to the returned rows. Partial/truncated/legacy responses remain additive, preserving cache; concurrent local writes are protected. Pagination/incremental synchronization remains the next step for queues exceeding the server row cap. The app does not have a durable per-ticket offline PATCH retry queue today.
