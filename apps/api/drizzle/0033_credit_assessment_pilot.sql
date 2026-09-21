CREATE TABLE merchant_credit_profiles (
 merchant_id uuid PRIMARY KEY REFERENCES merchants(id), data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE staff_permissions (
 user_id uuid PRIMARY KEY REFERENCES users(id), permission varchar(40) NOT NULL DEFAULT 'credit_analyst' CHECK (permission = 'credit_analyst'),
 active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE credit_pilot_enrollments (
 merchant_id uuid PRIMARY KEY REFERENCES merchants(id), active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE staff_credit_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id uuid REFERENCES merchants(id),
 actor_user_id uuid NOT NULL REFERENCES users(id), synthetic boolean NOT NULL,
 model_version varchar(64) NOT NULL, input jsonb NOT NULL, result jsonb NOT NULL,
 idempotency_key varchar(128) NOT NULL, input_fingerprint varchar(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((synthetic AND merchant_id IS NULL) OR (NOT synthetic AND merchant_id IS NOT NULL))
);
CREATE UNIQUE INDEX staff_credit_assessments_idempotency ON staff_credit_assessments(actor_user_id,idempotency_key);
CREATE INDEX staff_credit_assessments_merchant_time ON staff_credit_assessments(merchant_id,created_at);
-- Server-only access, consistent with the existing private application tables.
DO $$ DECLARE tab text; client_role text; BEGIN
 FOREACH tab IN ARRAY ARRAY['merchant_credit_profiles','staff_permissions','credit_pilot_enrollments','staff_credit_assessments'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',tab);
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',tab,client_role);
 END IF;
 END LOOP;
 END LOOP;
END $$;
