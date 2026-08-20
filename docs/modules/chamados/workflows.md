# Chamados — Workflows

> Step-by-step user flows for the Chamados module.

## Workflow 1: Create Ticket (Professor)

```mermaid
sequenceDiagram
    participant P as Professor
    participant F as TicketForm
    participant API as Flask API
    participant DB as Supabase
    participant TI as TI Team

    P->>F: Opens /chamados-publico (via QR)
    F->>F: Selects campus, room, category
    F->>F: Fills description, priority
    F->>F: Optionally attaches photo
    F->>API: POST /api/chamados
    API->>API: Validate fields
    API->>API: Generate ticketNumber
    API->>DB: INSERT chamados_tickets
    API->>TI: Push notification
    API-->>F: 200 { ticket }
    F->>P: Redirect to success page
    P->>P: Sees ticket number + status
```

## Workflow 2: Resolve Ticket (Technician)

```mermaid
sequenceDiagram
    participant TI as Technician
    participant LIST as TicketList
    participant DETAIL as TicketDetail
    participant API as Flask API
    participant DB as Supabase
    participant P as Professor

    TI->>LIST: Views ticket list
    LIST->>LIST: Filters by status/priority
    TI->>DETAIL: Opens ticket
    DETAIL->>DETAIL: Adds comment
    DETAIL->>API: PATCH /api/chamados/:id
    API->>DB: UPDATE + event
    DETAIL->>DETAIL: Changes status → em_atendimento
    DETAIL->>API: PATCH status
    API->>DB: UPDATE
    API->>P: Push: "Status updated"
    DETAIL->>DETAIL: Changes status → resolvido
    DETAIL->>API: PATCH status
    API->>P: Push: "Como foi? ⭐"
    DB-->>P: Realtime update
```

## Workflow 3: Rate Service (Professor)

```mermaid
sequenceDiagram
    participant P as Professor
    participant FB as FeedbackPage
    participant API as Flask API
    participant DB as Supabase

    P->>FB: Clicks link in push notification
    FB->>FB: Loads ticket by ID
    FB->>FB: Shows star rating widget
    P->>FB: Selects 4 stars + comment
    FB->>API: POST /api/chamados/:id/feedback
    API->>API: Validate (1-5 stars, max 500 chars)
    API->>DB: UPDATE feedbackRating, feedbackComment
    API-->>FB: 200 { ticket }
    FB->>P: "Obrigado pela avaliação!"
```

## Workflow 4: Approve User (Admin)

```mermaid
sequenceDiagram
    participant U as New User
    participant API as Flask API
    participant DB as Supabase
    participant SW as Service Worker
    participant A as Admin

    U->>API: signUp (creates profile with status: pending)
    API->>DB: INSERT profiles (pending)
    API->>SW: Push to role:admin with actions
    SW->>A: "Novo cadastro: Aprovar / Recusar"
    A->>API: POST /api/push/action {approve, role, app_access}
    API->>DB: PATCH profiles (status: active)
    API->>SW: Push confirmation to user
```

## Workflow 5: Batch Operations (Technician)

1. Select multiple tickets via checkboxes
2. BatchActionBar appears with options:
   - Archive selected
   - Assign to technician
   - Change priority
   - Change status
3. Confirmation dialog
4. All selected tickets updated
5. List refreshes

## Related

- [Overview](overview.md)
- [Architecture](architecture.md)
- [Reference](reference.md)
