import importlib.util
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "src" / "apps" / "reservalab" / "api" / "pg_store.py"
)
SPEC = importlib.util.spec_from_file_location("pg_store_outbox_under_test", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_outbox_enqueue_uses_stable_event_id_and_payload():
    with patch.object(MODULE, "_rpc", return_value=True) as rpc:
        assert MODULE.PostgresStore().notification_outbox_enqueue(
            "evt-1", "ntf-1", {"title": "Chamado"}
        ) is True
    rpc.assert_called_once_with("notification_outbox_enqueue", {
        "p_event_id": "evt-1",
        "p_notification_id": "ntf-1",
        "p_payload": {"title": "Chamado"},
    })


def test_outbox_claim_for_publish_requires_list_response():
    with patch.object(MODULE, "_rpc", return_value=[{"event_id": "evt-1"}]) as rpc:
        rows = MODULE.PostgresStore().notification_outbox_claim_for_publish(
            "worker-a", limit=5, lease_seconds=45
        )
    assert rows == [{"event_id": "evt-1"}]
    rpc.assert_called_once_with("notification_outbox_claim_for_publish", {
        "p_worker_id": "worker-a",
        "p_limit": 5,
        "p_lease_seconds": 45,
    })

    with patch.object(MODULE, "_rpc", return_value={"event_id": "evt-1"}):
        try:
            MODULE.PostgresStore().notification_outbox_claim_for_publish("worker-a")
        except MODULE.PostgresError:
            pass
        else:
            raise AssertionError("invalid claim response must fail closed")


def test_outbox_claim_event_returns_first_row_or_none():
    store = MODULE.PostgresStore()
    with patch.object(MODULE, "_rpc", return_value=[]):
        assert store.notification_outbox_claim_event("evt-1", "worker-a") is None
    with patch.object(MODULE, "_rpc", return_value=[{
        "payload": {"title": "Push"},
        "lock_token": "lock-1",
        "attempts": 1,
    }]):
        result = store.notification_outbox_claim_event("evt-1", "worker-a")
    assert result["lock_token"] == "lock-1"
    assert result["attempts"] == 1


def test_outbox_completion_and_retry_preserve_rpc_results():
    store = MODULE.PostgresStore()
    with patch.object(MODULE, "_rpc", return_value="true") as rpc:
        assert store.notification_outbox_complete("evt-1", "lock-1") is True
    rpc.assert_called_once_with("notification_outbox_complete", {
        "p_event_id": "evt-1",
        "p_lock_token": "lock-1",
    })

    with patch.object(MODULE, "_rpc", return_value="pending") as rpc:
        assert store.notification_outbox_retry(
            "evt-1", "lock-1", "temporary", delay_seconds=60
        ) == "pending"
    rpc.assert_called_once_with("notification_outbox_retry", {
        "p_event_id": "evt-1",
        "p_lock_token": "lock-1",
        "p_error": "temporary",
        "p_delay_seconds": 60,
    })
