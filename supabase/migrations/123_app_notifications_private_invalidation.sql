-- 123_app_notifications_private_invalidation.sql
-- In-app notifications are still read only through the authenticated API.
-- Emit only a versioned, content-free invalidation to eligible personal topics.
CREATE OR REPLACE FUNCTION public.app_notifications_invalidation_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $body$
DECLARE
  recipient uuid;
BEGIN
  BEGIN
    FOR recipient IN
      SELECT p.id
      FROM public.profiles p
      WHERE p.status = 'active'
        AND (NEW.target_user_id IS NULL OR NEW.target_user_id = p.id)
        AND (NEW.target_super_admin IS DISTINCT FROM TRUE OR p.is_super_admin IS TRUE)
        AND (
          NEW.workspace_id IS NULL OR p.is_super_admin IS TRUE OR EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.profile_id = p.id AND m.workspace_id = NEW.workspace_id
              AND m.status = 'active'
          )
        )
    LOOP
      PERFORM realtime.send(
        '{"v":1}'::jsonb, 'changed',
        'labhub:notifications:user:' || recipient::text, true
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- An unavailable Realtime service must never roll back the durable notification.
    RAISE LOG 'app notifications invalidation unavailable (SQLSTATE %)', SQLSTATE;
  END;
  RETURN NULL;
END;
$body$;

REVOKE ALL ON FUNCTION public.app_notifications_invalidation_notify()
FROM PUBLIC, anon, authenticated;

DO $install$
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL
     OR to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'Realtime absent; private notification trigger not installed';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS labhub_notifications_invalidation_receive ON realtime.messages';
  EXECUTE $policy$
    CREATE POLICY labhub_notifications_invalidation_receive
    ON realtime.messages FOR SELECT TO authenticated
    USING (
      extension = 'broadcast'
      AND realtime.topic() = 'labhub:notifications:user:' || (SELECT auth.uid())::text
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.status = 'active'
      )
    )
  $policy$;

  DROP TRIGGER IF EXISTS app_notifications_invalidation_trigger ON public.app_notifications;
  CREATE TRIGGER app_notifications_invalidation_trigger
    AFTER INSERT ON public.app_notifications
    FOR EACH ROW EXECUTE FUNCTION public.app_notifications_invalidation_notify();
END
$install$;
