"""Contrato de segurança da invalidação de chamados (migration 121)."""
from pathlib import Path

SQL = (Path(__file__).resolve().parents[2] / 'supabase/migrations/121_chamados_ticket_invalidation_broadcast.sql').read_text(encoding='utf-8')

def test_server_only_event_source_and_private_topic():
    assert "AFTER INSERT OR UPDATE OR DELETE" in SQL
    assert "realtime.send(" in SQL
    assert "'labhub:chamados:workspace:' || v_ws::text" in SQL
    assert "true\n      );" in SQL  # private
    assert "EXCEPTION WHEN OTHERS" in SQL
    assert "RETURN NULL" in SQL

def test_no_client_write_or_raw_ticket_fields():
    assert "ON realtime.messages FOR SELECT TO authenticated" in SQL
    assert "FOR INSERT TO authenticated" not in SQL
    assert "p.status = 'active'" in SQL
    assert "m.status = 'active'" in SQL
    assert "rp.action = 'ticket.view'" in SQL
    assert "mo.effect = 'deny'" in SQL
    assert "FROM PUBLIC, anon, authenticated" in SQL
    assert "jsonb_build_object('v', 1, 'operation', TG_OP, 'ticket_id', v_ticket_id)" in SQL
    assert "row_to_json" not in SQL
    assert "to_jsonb(NEW)" not in SQL

def test_ci_without_realtime_is_non_destructive():
    assert "to_regprocedure('realtime.send(jsonb,text,text,boolean)')" in SQL
    assert "to_regclass('realtime.messages')" in SQL
    assert "DROP TRIGGER IF EXISTS" in SQL
