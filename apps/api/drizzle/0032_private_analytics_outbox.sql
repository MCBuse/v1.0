-- The transactional outbox is managed by SQL triggers rather than a Drizzle
-- table declaration; apply the same server-only access rule explicitly.
ALTER TABLE public.merchant_analytics_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.merchant_analytics_outbox FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.merchant_analytics_outbox FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
