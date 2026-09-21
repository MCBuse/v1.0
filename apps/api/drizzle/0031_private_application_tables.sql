-- MCBuse authenticates and authorizes through NestJS. Its application tables
-- are private to the server-side database role, not Supabase client roles.
-- Keep the table owner and service_role access; deny direct Data API clients.
DO $$
DECLARE
  relation record;
  client_role text;
BEGIN
  FOR relation IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname = ANY (ARRAY[
      'audit_logs',
      'balances',
      'chain_attempts',
      'financial_operation_events',
      'financial_operations',
      'ledger_entries',
      'merchant_analytics_runs',
      'merchant_analytics_snapshots',
      'merchant_analytics_work',
      'merchant_assessments',
      'merchant_capture_exceptions',
      'merchant_cash_sale_attachments',
      'merchant_cash_sale_items',
      'merchant_cash_sales',
      'merchant_consent_records',
      'merchant_events',
      'merchant_finance_email_attempts',
      'merchant_finance_package_artifacts',
      'merchant_finance_package_assessments',
      'merchant_finance_packages',
      'merchant_import_batches',
      'merchant_insights',
      'merchant_invoice_items',
      'merchant_memberships',
      'merchant_narration_cache',
      'merchant_payment_attempts',
      'merchant_payout_allocations',
      'merchant_payouts',
      'merchant_presented_requests',
      'merchant_product_source_mappings',
      'merchant_products',
      'merchant_stock_movements',
      'merchant_transactions',
      'merchants',
      'offramp_transactions',
      'onramp_transactions',
      'password_reset_codes',
      'payment_requests',
      'provider_webhook_events',
      'refresh_tokens',
      'users',
      'wallet_encryption_key_versions',
      'wallets'
      ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation.relname);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', relation.relname);
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', relation.relname, client_role);
      END IF;
    END LOOP;
  END LOOP;

  -- Avoid granting access to future private application tables by default.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
