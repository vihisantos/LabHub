from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import Mock
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src/apps/reservalab/api"))
from notification_periodic import due_inventory_check, run_inventory_check

NOW = datetime(2026, 11, 24, 10, 0, tzinfo=timezone(timedelta(hours=-3)))

@pytest.mark.parametrize("minute,expected", [(0, "stock-loans"), (4, "stock-loans"), (5, None),
    (15, "pcare-parts"), (30, "stock-expiry"), (45, "pcare-maint"), (55, None)])
def test_staggered_slots(minute, expected):
    assert due_inventory_check(NOW.replace(minute=minute)) == expected

@pytest.mark.parametrize("kind,fields,module,context", [
    ("stock-loans", {"itemName": "Item", "expectedReturnAt": "2026-11-23T12:00:00Z"}, "stock", "overdue"),
    ("stock-expiry", {"name": "Item", "expiresAt": "2026-12-01T12:00:00Z"}, "stock", "stock-expiry"),
    ("pcare-parts", {"name": "Peça", "quantity": 1, "minQuantity": 5}, "pc-care", "pcare-part"),
    ("pcare-maint", {"pcNumber": "PC", "scheduledDate": "2026-11-25"}, "pc-care", "pcare-maint"),
])
def test_campus_scope_and_idempotency(kind, fields, module, context):
    read = Mock(return_value=[{"id": "one", "workspace_id": "ws-a", **fields},
                              {"id": "two", "workspace_id": None, **fields}])
    enqueue = Mock(return_value="queued")
    result = run_inventory_check(kind, NOW, read=read, enqueue=enqueue)
    assert result["queued"] == 1 and result["failures"] == 1
    assert enqueue.call_args.kwargs["workspace_id"] == "ws-a"
    assert enqueue.call_args.kwargs["module"] == module
    assert enqueue.call_args.kwargs["context"] == context
    event_id = enqueue.call_args.args[0]
    enqueue.return_value = "duplicate"
    assert run_inventory_check(kind, NOW, read=read, enqueue=enqueue)["queued"] == 0
    assert enqueue.call_args.args[0] == event_id
    enqueue.return_value = None
    assert run_inventory_check(kind, NOW, read=read, enqueue=enqueue)["failures"] == 2

def test_real_case_sensitive_stock_filters():
    read = Mock(return_value=[])
    run_inventory_check("stock-loans", NOW, read=read, enqueue=Mock())
    params = read.call_args.args[2]
    assert params["returnedAt"] == "is.null"
    assert params["deletedAt"] == "is.null"
    assert "expectedReturnAt" in params

def test_no_low_stock_no_notification():
    enqueue = Mock()
    run_inventory_check("pcare-parts", NOW, read=Mock(return_value=[
        {"id": "one", "workspace_id": "ws-a", "quantity": 5, "minQuantity": 5},
    ]), enqueue=enqueue)
    enqueue.assert_not_called()
