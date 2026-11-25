-- 121_chamados_ticket_invalidation_broadcast.sql
-- Trigger de invalidacao SOMENTE para refrescar fila operacional no PWA.
-- Nada de dados do chamado é exposto via Realtime; GET /api/chamados aplica JWT/RBAC.
-- Em PostgreSQL efêmero do CI sem Supabase Realtime, só a função é instalada:
-- trigger/policy são habilitados automaticamente apenas no Supabase gerenciado.

CREATE OR REPLACE FUNCTION public.chamados_ticket_invalidation_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $body$
DECLARE
  v_ws uuid;
  v_old_ws uuid;
  v_ticket_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ws := OLD.workspace_id;
    v_ticket_id := OLD.id;
  ELSE
    v_ws := NEW.workspace_id;
    v_ticket_id := NEW.id;
    IF TG_OP = 'UPDATE' THEN
      v_old_ws := OLD.workspace_id;
    END IF;
  END IF;

  -- Realtime é best-effort: uma falha no canal NUNCA bloqueia criar/atender
  -- chamados. O fallback HTTP do cliente reconcilia eventos perdidos.
  BEGIN
    IF v_ws IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object('v', 1, 'operation', TG_OP, 'ticket_id', v_ticket_id),
        'changed',
        'labhub:chamados:workspace:' || v_ws::text,
        true
      );
    END IF;
    IF v_old_ws IS NOT NULL AND v_old_ws IS DISTINCT FROM v_ws THEN
      PERFORM realtime.send(
        jsonb_build_object('v', 1, 'operation', TG_OP, 'ticket_id', v_ticket_id),
        'changed',
        'labhub:chamados:workspace:' || v_old_ws::text,
        true
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'chamados invalidation broadcast unavailable (SQLSTATE %)', SQLSTATE;
  END;

  RETURN NULL; -- AFTER ROW; não altera a mutação de dados
END;
$body$;

REVOKE ALL ON FUNCTION public.chamados_ticket_invalidation_notify()
FROM PUBLIC, anon, authenticated;

DO $install$
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL
     OR to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'Supabase Realtime ausente: canal privado e trigger não instalados neste ambiente';
    RETURN;
  END IF;

  -- Política de RECEPÇÃO apenas; nenhum usuário pode publicar por INSERT.
  -- A mensagem contém id/ação para invalidação, nunca descrição ou dados pessoais.
  EXECUTE 'DROP POLICY IF EXISTS labhub_chamados_invalidation_receive ON realtime.messages';
  EXECUTE $policy$
    CREATE POLICY labhub_chamados_invalidation_receive
    ON realtime.messages FOR SELECT TO authenticated
    USING (
      extension = 'broadcast'
      AND split_part(realtime.topic(), ':', 1) = 'labhub'
      AND split_part(realtime.topic(), ':', 2) = 'chamados'
      AND split_part(realtime.topic(), ':', 3) = 'workspace'
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.status = 'active'
          AND (
            p.is_super_admin
            OR EXISTS (
              SELECT 1
              FROM public.memberships m
              WHERE m.profile_id = p.id
                AND m.status = 'active'
                AND m.workspace_id::text = split_part(realtime.topic(), ':', 4)
                AND (
                  EXISTS (
                    SELECT 1 FROM public.role_permissions rp
                    WHERE rp.role_id = m.role_id AND rp.action = 'ticket.view'
                  ) OR EXISTS (
                    SELECT 1 FROM public.membership_overrides mo
                    WHERE mo.membership_id = m.id
                      AND mo.action = 'ticket.view' AND mo.effect = 'allow'
                  )
                )
                AND NOT EXISTS (
                  SELECT 1 FROM public.membership_overrides mo
                  WHERE mo.membership_id = m.id
                    AND mo.action = 'ticket.view' AND mo.effect = 'deny'
                )
            )
          )
      )
    )
  $policy$;

  DROP TRIGGER IF EXISTS chamados_ticket_invalidation_trigger
    ON public.chamados_tickets;
  CREATE TRIGGER chamados_ticket_invalidation_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.chamados_tickets
    FOR EACH ROW EXECUTE FUNCTION public.chamados_ticket_invalidation_notify();
END
$install$;
