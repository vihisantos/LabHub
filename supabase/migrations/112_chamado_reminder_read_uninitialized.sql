-- Corrige o contrato de `chamado_reminder_read()` para o estado inicial.
--
-- `chamado_reminder_acquire()` (e `chamado_reminder_transition()` sem write
-- prévio) cria uma linha em `chamado_reminder_states` com `last_reminder_at`
-- nulo. A versão anterior devolvia esse objeto "zerado" como estado válido,
-- com `last_known_status`/`last_reminder_at` em JSON null. O worker valida o
-- estado com `_valid_reminder_state_shape()`, que rejeita campos nulos — e
-- passava a pular o chamado para sempre, sem enviar nenhum lembrete.
--
-- A correção preserva o contrato documentado: sem onda persistida a RPC
-- devolve `{"ok": true, "state": null}` (o mesmo que devolveria uma chave
-- Redis ausente), e o worker aplica o caminho de estado inicial. Quando há
-- estado, `jsonb_strip_nulls` garante que nenhum campo nulo chegue ao
-- validador estrito do lado Python.

CREATE OR REPLACE FUNCTION public.chamado_reminder_read(
  p_ticket_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.chamado_reminder_states%ROWTYPE;
  v_owner uuid;
  v_until timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));
  SELECT * INTO v_row FROM public.chamado_reminder_states
  WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'state', NULL);
  END IF;

  IF p_token IS NOT NULL THEN
    SELECT lock_token, lock_expires_at INTO v_owner, v_until
    FROM public.chamado_reminder_states WHERE ticket_id = p_ticket_id;
    IF v_owner IS DISTINCT FROM p_token
       OR v_until IS NULL OR v_until <= clock_timestamp() THEN
      RETURN jsonb_build_object('ok', false);
    END IF;
  END IF;

  -- Sem `last_reminder_at` não houve nenhuma onda persistida: é o estado
  -- inicial criado por acquire() (ou um terminal registrado por transition()
  -- antes do primeiro envio). O worker deve tratá-lo como ausência de estado.
  IF v_row.last_reminder_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'state', NULL);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'state', jsonb_strip_nulls(jsonb_build_object(
      'ticket_id', v_row.ticket_id::text,
      'workspace_id', v_row.workspace_id::text,
      'reminder_count', v_row.reminder_count,
      'cycle_id', v_row.cycle_id,
      'last_reminder_at',
        to_char(v_row.last_reminder_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'last_known_status', v_row.last_known_status,
      'transition_generation', v_row.transition_generation
    ))
  );
END;
$$;
