-- Managed staging smoke test. No persistent data or actual notification delivery:
-- realtime.send inserts transactionally and the entire test rolls back.
BEGIN;
DO $test$
DECLARE
  target uuid;
  other_user uuid;
  test_id text := 'ci-notification-' || gen_random_uuid()::text;
  target_topic text;
  before_count bigint;
  after_count bigint;
  visible_count bigint;
BEGIN
  IF to_regclass('realtime.messages') IS NULL
     OR to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RAISE NOTICE 'Realtime unavailable in disposable PostgreSQL; managed test skipped';
    RETURN;
  END IF;
  IF has_function_privilege('authenticated','public.app_notifications_invalidation_notify()','EXECUTE')
     OR has_function_privilege('anon','public.app_notifications_invalidation_notify()','EXECUTE') THEN
    RAISE EXCEPTION 'notification trigger callable by clients';
  END IF;
  SELECT id INTO target FROM public.profiles WHERE status='active' ORDER BY id LIMIT 1;
  SELECT id INTO other_user FROM public.profiles WHERE status='active' AND id<>target ORDER BY id LIMIT 1;
  IF target IS NULL OR other_user IS NULL THEN
    RAISE NOTICE 'Managed test requires two existing active QA profiles; no auth fixture created';
    RETURN;
  END IF;
  target_topic := 'labhub:notifications:user:' || target::text;
  SELECT count(*) INTO before_count FROM realtime.messages
    WHERE topic=target_topic AND event='changed' AND (payload - 'id')='{"v":1}'::jsonb AND private IS TRUE;
  INSERT INTO public.app_notifications(id,title,body,target_user_id,audience)
    VALUES(test_id,'QA rollback only','QA rollback only',target,'user');
  SELECT count(*) INTO after_count FROM realtime.messages
    WHERE topic=target_topic AND event='changed' AND (payload - 'id')='{"v":1}'::jsonb AND private IS TRUE;
  IF after_count <> before_count+1 THEN
    RAISE EXCEPTION 'private invalidation missing or duplicated';
  END IF;

  PERFORM set_config('realtime.topic',target_topic,true);
  PERFORM set_config('request.jwt.claim.sub',target::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',target,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO visible_count FROM realtime.messages
    WHERE topic=target_topic AND event='changed' AND private IS TRUE;
  RESET ROLE;
  IF visible_count < 1 THEN RAISE EXCEPTION 'owner cannot receive personal invalidation'; END IF;

  PERFORM set_config('request.jwt.claim.sub',other_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_user,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO visible_count FROM realtime.messages WHERE topic=target_topic;
  RESET ROLE;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'cross-user invalidation visible'; END IF;
END
$test$;
ROLLBACK;
