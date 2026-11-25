"""Periodic inventory producers: bounded, campus-scoped, outbox only."""
from datetime import timedelta
import hashlib
import uuid

# Spread expensive checks over the hour, without increasing QStash frequency.
SLOTS = {0: "stock-loans", 15: "pcare-parts", 30: "stock-expiry", 45: "pcare-maint"}
PAGE_LIMIT = 100

def due_inventory_check(now):
    return SLOTS.get((now.minute // 5) * 5)

def run_inventory_check(kind, now, *, read, enqueue, cursor=None):
    today = now.date()
    day = today.isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()
    specifications = {
        "stock-loans": ("stock", "stock_movements", {
            "select": "id,workspace_id,itemName,borrowedBy,expectedReturnAt",
            "type": "eq.emprestimo", "returnedAt": "is.null", "deletedAt": "is.null",
            "expectedReturnAt": "lte." + (now + timedelta(hours=12)).isoformat(),
        }),
        "stock-expiry": ("stock", "stock_items", {
            "select": "id,workspace_id,name,expiresAt",
            "status": "neq.descartado",
            "expiresAt": "lt." + (today + timedelta(days=31)).isoformat(),
        }),
        "pcare-parts": ("pcare", "parts", {
            "select": "id,workspace_id,name,quantity,minQuantity",
        }),
        "pcare-maint": ("pcare", "maintenance", {
            "select": "id,workspace_id,pcNumber,labName,type,scheduledDate",
            "completed": "eq.false", "scheduledDate": "gte." + day,
            "and": "(scheduledDate.lte." + tomorrow + ")",
        }),
    }
    schema, table, params = specifications[kind]
    query = {**params, "order": "id.asc", "limit": PAGE_LIMIT}
    if cursor:
        query["id"] = "gt." + str(cursor)
    rows = read(schema, table, query)
    if not isinstance(rows, list):
        raise ValueError("invalid inventory response")
    queued = failures = eligible = 0
    # The caller persists the keyset cursor for the next scheduled slot.
    # A failed enqueue must not advance past an undelivered event.
    enqueue_failed = False
    for row in rows:
        identifier, workspace = row.get("id"), row.get("workspace_id")
        if not identifier or not workspace:
            failures += 1
            continue
        if kind == "stock-loans":
            # Includes genuinely overdue loans, not only the next 12 hours.
            deadline = row.get("expectedReturnAt")
            if not deadline:
                continue
            bucket = int(now.timestamp() // 43200)
            key = f"overdue|{identifier}|{bucket}"
            title = f"Prazo de devolução: {row.get('itemName') or 'Item'}"
            message = f"Emprestado para {row.get('borrowedBy') or 'Responsável'} — prazo {str(deadline)[:10]}"
            module, context, url, ttl = "stock", "overdue", "/stock/loans", 43200
        elif kind == "stock-expiry":
            deadline = row.get("expiresAt")
            if not deadline:
                continue
            from datetime import date
            try:
                days = (date.fromisoformat(str(deadline)[:10]) - today).days
            except ValueError:
                failures += 1
                continue
            if days > 30:
                continue
            key = f"expiry|{identifier}|{day}"
            title = "Item vencido" if days < 0 else "Validade próxima"
            message = f"{row.get('name') or 'Item'} — validade {str(deadline)[:10]}"
            module, context, url, ttl = "stock", "stock-expiry", f"/stock/items/{identifier}", 86400
        elif kind == "pcare-parts":
            quantity, minimum = row.get("quantity"), row.get("minQuantity")
            if not isinstance(quantity, (int, float)) or not isinstance(minimum, (int, float)):
                failures += 1
                continue
            if quantity >= minimum:
                continue
            key = f"pcare|part|{identifier}|{day}"
            title = f"Estoque baixo: {row.get('name') or 'Peça'}"
            message = f"Quantidade: {quantity} | Mínimo: {minimum}"
            module, context, url, ttl = "pc-care", "pcare-part", "/pc-care", 86400
        else:
            scheduled = str(row.get("scheduledDate") or "")[:10]
            if not day <= scheduled <= tomorrow:
                continue
            key = f"pcare|maint|{identifier}|{scheduled}"
            title = f"Manutenção: {row.get('pcNumber') or 'PC'}"
            message = f"{row.get('labName') or 'Lab'} — {row.get('type') or ''} — {scheduled}"
            module, context, url, ttl = "pc-care", "pcare-maint", "/pc-care", 86400
        eligible += 1
        event_id = hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()
        try:
            result = enqueue(event_id, title, message, module=module,
                             workspace_id=workspace, context=context, url=url, ttl=ttl,
                             inventory_id=str(identifier))
        except Exception:
            result = None
        if result == "queued":
            queued += 1
        elif result != "duplicate":
            failures += 1
            enqueue_failed = True
    result = {"checked": True, "found": eligible, "queued": queued}
    if len(rows) >= PAGE_LIMIT or cursor:
        result["next_cursor"] = (str(rows[-1]["id"]) if len(rows) >= PAGE_LIMIT and rows[-1].get("id") else None)
        result["complete"] = result["next_cursor"] is None
    if enqueue_failed:
        result["next_cursor"] = cursor
        result["complete"] = False
    if failures:
        result.update(error="inventory check incomplete", failures=failures)
    return result


# Reuse the same eligibility predicates and event identity for a fresh, single
# scoped row. An expired bucket or changed campus is not a new delivery.
INVENTORY_CONTEXTS = {
    ("stock", "overdue"): "stock-loans",
    ("stock", "stock-expiry"): "stock-expiry",
    ("pc-care", "pcare-part"): "pcare-parts",
    ("pc-care", "pcare-maint"): "pcare-maint",
}


def revalidate_inventory_event(event_id, payload, now, *, read):
    kind = INVENTORY_CONTEXTS.get((payload.get("module"), payload.get("context")))
    if kind is None:
        raise ValueError("unknown inventory event")
    try:
        item = str(uuid.UUID(str(payload.get("inventory_id"))))
        workspace = str(uuid.UUID(str(payload.get("workspace_id"))))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("inventory event missing canonical scope") from exc
    current = []

    def scoped_read(schema, table, params):
        rows = read(schema, table, {**params, "id": "eq." + item,
                                   "workspace_id": "eq." + workspace, "limit": 1})
        if not isinstance(rows, list) or len(rows) > 1:
            raise RuntimeError("invalid inventory revalidation response")
        for row in rows:
            if str(row.get("id")) != item or str(row.get("workspace_id")) != workspace:
                raise RuntimeError("inventory revalidation scope mismatch")
        return rows

    def capture(candidate, title, message, **kwargs):
        if candidate == event_id:
            current.append((title, message))
        return "duplicate"

    outcome = run_inventory_check(kind, now, read=scoped_read, enqueue=capture)
    if outcome.get("error"):
        raise RuntimeError("inventory revalidation incomplete")
    return current[0] if current else None
