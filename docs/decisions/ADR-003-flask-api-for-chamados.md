# ADR-003 — Flask API for Chamados

## Status

Accepted

## Context

The Chamados module needs to:
1. Bypass RLS to create tickets from public (unauthenticated) forms
2. Generate sequential ticket numbers
3. Send push notifications
4. Integrate with multiple external services

The existing frontend-only pattern (localStorage + sync) doesn't work because:
- `chamados_tickets` table has `REVOKE ALL FROM anon, authenticated`
- Public form users are not authenticated
- Ticket number generation needs server-side sequencing

## Decision

Use a Flask (Python) API deployed as Vercel Serverless Functions for all `/api/chamados*` endpoints. The API uses the Supabase service_role key to bypass RLS.

## Alternatives Considered

1. **Supabase Edge Functions** — Would work but team has more Python expertise
2. **Direct Supabase access with anon key** — Can't bypass RLS for public forms
3. **Next.js API routes** — Project uses Vite, not Next.js

## Consequences

### Positive
- Full control over business logic (validation, sequencing, notifications)
- Service_role bypasses RLS for public operations
- Python ecosystem for SharePoint integration
- Vercel Serverless handles scaling automatically

### Negative
- Additional runtime (Python) in a primarily TypeScript project
- Cold start latency on serverless functions
- Separate deployment concern from frontend

## Related

- `src/apps/reservalab/api/app.py` — Main Flask app
- `api/app.py` — Vercel entry point
- [Architecture: Backend](../architecture/backend.md)
