import importlib.util
from pathlib import Path
from unittest.mock import Mock

MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "src" / "apps" / "reservalab" / "api" / "notification_dispatcher.py"
)
SPEC = importlib.util.spec_from_file_location("notification_dispatcher_under_test", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_publish_pending_enqueues_then_marks_queued():
    outbox = Mock()
    queue = Mock()
    outbox.notification_outbox_claim_for_publish.return_value = [{
        "event_id": "evt-1",
        "lock_token": "lock-1",
        "publish_attempts": 1,
        "payload": {"title": "Push"},
    }]

    result = MODULE.publish_pending(outbox, queue, "publisher-a", limit=5)

    queue.ensure_group.assert_called_once_with()
    queue.enqueue.assert_called_once_with("evt-1", {"title": "Push"})
    outbox.notification_outbox_mark_queued.assert_called_once_with("evt-1", "lock-1")
    assert result == {"claimed": 1, "published": 1, "released": 0, "invalid_claims": 0}


def test_publish_pending_releases_failed_publish_with_backoff():
    outbox = Mock()
    queue = Mock()
    outbox.notification_outbox_claim_for_publish.return_value = [{
        "event_id": "evt-1",
        "lock_token": "lock-1",
        "publish_attempts": 3,
        "payload": {"title": "Push"},
    }]
    queue.enqueue.side_effect = RuntimeError("Redis unavailable")

    result = MODULE.publish_pending(outbox, queue, "publisher-a")

    outbox.notification_outbox_release_publish.assert_called_once_with(
        "evt-1", "lock-1", "Redis unavailable", delay_seconds=20
    )
    outbox.notification_outbox_mark_queued.assert_not_called()
    assert result["released"] == 1


def _queue_with_messages():
    queue = Mock()
    queue.reclaim_stale.return_value = {
        "next_id": "0-0",
        "messages": [],
        "deleted_ids": [],
    }
    queue.read_new.return_value = [{
        "event_id": "evt-1",
        "message_id": "1-0",
        "payload": {"title": "Push"},
        "stream": "labhub:notifications:stream:v1",
    }]
    queue.acknowledge.return_value = 1
    return queue


def test_process_pending_completes_postgres_before_ack():
    outbox = Mock()
    queue = _queue_with_messages()
    outbox.notification_outbox_claim_event.return_value = {
        "payload": {"title": "Push"},
        "lock_token": "lock-1",
        "attempts": 1,
    }
    outbox.notification_outbox_complete.return_value = True

    result = MODULE.process_pending(
        outbox, queue, "worker-a", lambda event_id, payload: True
    )

    outbox.notification_outbox_complete.assert_called_once_with("evt-1", "lock-1")
    queue.acknowledge.assert_called_once_with("1-0")
    assert result["delivered"] == 1
    assert result["acked"] == 1


def test_process_pending_retries_then_acks_only_after_retry_persisted():
    outbox = Mock()
    queue = _queue_with_messages()
    outbox.notification_outbox_claim_event.return_value = {
        "payload": {"title": "Push"},
        "lock_token": "lock-1",
        "attempts": 2,
    }
    outbox.notification_outbox_retry.return_value = "pending"

    def fail_handler(event_id, payload):
        raise RuntimeError("push provider timeout")

    result = MODULE.process_pending(outbox, queue, "worker-a", fail_handler)

    outbox.notification_outbox_retry.assert_called_once_with(
        "evt-1", "lock-1", "push provider timeout", delay_seconds=30
    )
    queue.acknowledge.assert_called_once_with("1-0")
    assert result["retried"] == 1
    assert result["acked"] == 1


def test_process_pending_does_not_ack_when_retry_state_cannot_be_saved():
    outbox = Mock()
    queue = _queue_with_messages()
    outbox.notification_outbox_claim_event.return_value = {
        "payload": {"title": "Push"},
        "lock_token": "lock-1",
        "attempts": 1,
    }
    outbox.notification_outbox_retry.return_value = None

    result = MODULE.process_pending(
        outbox, queue, "worker-a",
        lambda event_id, payload: (_ for _ in ()).throw(RuntimeError("failure")),
    )

    queue.acknowledge.assert_not_called()
    assert result["failed"] == 1


def test_process_pending_acks_duplicate_without_reprocessing():
    outbox = Mock()
    queue = _queue_with_messages()
    outbox.notification_outbox_claim_event.return_value = None

    result = MODULE.process_pending(
        outbox, queue, "worker-a", lambda event_id, payload: True
    )

    outbox.notification_outbox_complete.assert_not_called()
    queue.acknowledge.assert_called_once_with("1-0")
    assert result["duplicates"] == 1
