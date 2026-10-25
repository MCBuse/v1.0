-- Change Intelligence (plan §4.1, §4.2, §8). Additive only. The legacy
-- analytics triggers from 0029 are left exactly as they are.

ALTER TABLE merchants ADD COLUMN data_provenance varchar(16) NOT NULL DEFAULT 'ordinary',
 ADD CONSTRAINT merchants_data_provenance_check CHECK (data_provenance IN ('ordinary','sample'));
--> statement-breakpoint
-- One person may hold several staff permissions (§8 "Update now").
ALTER TABLE staff_permissions DROP CONSTRAINT staff_permissions_pkey,
 ADD CONSTRAINT staff_permissions_pkey PRIMARY KEY (user_id, permission),
 DROP CONSTRAINT staff_permissions_permission_check,
 ADD CONSTRAINT staff_permissions_permission_check CHECK (permission IN ('credit_analyst','change_intelligence_operator'));
--> statement-breakpoint
-- Durable work: one row per merchant, kept after success. Revisions only grow.
-- Pending = requested_revision > processed_revision (status is worker-owned).
CREATE TABLE merchant_change_work (
 merchant_id uuid PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
 requested_revision bigint NOT NULL DEFAULT 0,
 processed_revision bigint NOT NULL DEFAULT 0,
 claimed_revision bigint,
 lease_token uuid,
 lease_until timestamptz,
 claimed_at timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz,
 status varchar(16) NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','processing','failed')),
 last_error text,
 requested_reason varchar(32) CHECK (requested_reason IN ('source_change','clock','initialization','reconciliation','model_upgrade','settings_change')),
 last_requested_at timestamptz NOT NULL DEFAULT now(),
 bootstrap_status varchar(16) NOT NULL DEFAULT 'pending' CHECK (bootstrap_status IN ('pending','completed')),
 model_version varchar(64),
 settings_fingerprint varchar(64),
 last_daily_evaluation_date date,
 next_daily_evaluation_at timestamptz,
 last_success_at timestamptz,
 last_failure_at timestamptz,
 last_update_now_at timestamptz,
 CHECK (requested_revision >= 0 AND processed_revision >= 0 AND processed_revision <= requested_revision),
 CHECK (claimed_revision IS NULL OR claimed_revision <= requested_revision),
 CHECK (attempts >= 0)
);
-- Deliberately unindexed beyond the PK: one row per merchant, and any index on
-- requested_revision would stop the per-event bump from being a HOT update.
--> statement-breakpoint
CREATE TABLE merchant_change_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
 model_version varchar(64) NOT NULL,
 settings jsonb NOT NULL,
 settings_fingerprint varchar(64) NOT NULL,
 as_of timestamptz NOT NULL,
 -- The claimed work revision: every event with revision <= this was visible.
 source_revision bigint NOT NULL,
 source_cutoff_at timestamptz NOT NULL,
 reason varchar(32) NOT NULL CHECK (reason IN ('source_change','clock','initialization','reconciliation','model_upgrade','settings_change')),
 status varchar(16) NOT NULL CHECK (status IN ('succeeded','failed')),
 started_at timestamptz NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(),
 duration_ms integer CHECK (duration_ms >= 0),
 counts jsonb NOT NULL DEFAULT '{}'::jsonb,
 coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
 fingerprint varchar(64),
 error text,
 requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT merchant_change_runs_merchant_id_unique UNIQUE (merchant_id, id),
 CHECK ((status = 'failed') = (error IS NOT NULL))
);
CREATE INDEX merchant_change_runs_merchant_time ON merchant_change_runs(merchant_id, completed_at DESC, id DESC);
CREATE INDEX merchant_change_runs_retention ON merchant_change_runs(completed_at);
--> statement-breakpoint
CREATE TABLE merchant_change_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
 -- The work revision this event advanced to, under the work row lock.
 revision bigint NOT NULL,
 source_type varchar(40) NOT NULL CHECK (source_type IN ('merchant_transactions','merchant_cash_sales','merchant_cash_sale_items','merchant_products','merchant_import_batches','merchants')),
 source_id uuid NOT NULL,
 operation varchar(8) NOT NULL CHECK (operation IN ('insert','update','delete')),
 changed_fields text[] NOT NULL DEFAULT '{}',
 old_product_id uuid,
 new_product_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','resolved')),
 run_id uuid,
 processed_at timestamptz,
 CONSTRAINT merchant_change_events_run_fk FOREIGN KEY (merchant_id, run_id) REFERENCES merchant_change_runs(merchant_id, id),
 CHECK ((status = 'pending') = (processed_at IS NULL)),
 CHECK (status <> 'processed' OR run_id IS NOT NULL)
);
CREATE INDEX merchant_change_events_pending ON merchant_change_events(merchant_id, revision, id) WHERE status = 'pending';
CREATE INDEX merchant_change_events_retention ON merchant_change_events(processed_at) WHERE status <> 'pending';
CREATE INDEX merchant_change_events_run ON merchant_change_events(merchant_id, run_id) WHERE run_id IS NOT NULL;
--> statement-breakpoint
-- No product FKs on states, transitions or cases: history outlives products.
CREATE TABLE merchant_change_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
 product_id uuid,
 node_key varchar(80) NOT NULL,
 value jsonb NOT NULL,
 readiness varchar(32) NOT NULL CHECK (readiness IN ('ready','building_baseline','insufficient_history','recording_gap','data_quality_blocked')),
 fingerprint varchar(64) NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
 last_changed_at timestamptz NOT NULL,
 run_id uuid NOT NULL,
 CONSTRAINT merchant_change_states_identity UNIQUE NULLS NOT DISTINCT (merchant_id, product_id, node_key),
 CONSTRAINT merchant_change_states_merchant_id_unique UNIQUE (merchant_id, id),
 CONSTRAINT merchant_change_states_run_fk FOREIGN KEY (merchant_id, run_id) REFERENCES merchant_change_runs(merchant_id, id)
);
CREATE INDEX merchant_change_states_recent ON merchant_change_states(merchant_id, last_changed_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE merchant_change_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
 product_id uuid NOT NULL,
 case_type varchar(40) NOT NULL CHECK (case_type IN ('transaction_velocity_increase','transaction_velocity_decrease','unit_demand_increase','unit_demand_decrease','stock_risk','stock_threshold_change','historical_correction')),
 status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
 severity varchar(16) NOT NULL CHECK (severity IN ('high','medium','low')),
 priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 5),
 first_detected_at timestamptz NOT NULL,
 last_detected_at timestamptz NOT NULL,
 last_changed_at timestamptz NOT NULL,
 -- No FK: transitions reference cases, so this side stays a plain pointer.
 latest_transition_id uuid,
 resolution varchar(32) CHECK (resolution IN ('returned_to_usual','no_longer_detected','no_longer_assessable','direction_reversed','stock_normal','product_archived')),
 resolved_at timestamptz,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 counters jsonb NOT NULL DEFAULT '{}'::jsonb,
 settings jsonb NOT NULL,
 settings_fingerprint varchar(64) NOT NULL,
 model_version varchar(64) NOT NULL,
 identified_during_initial_analysis boolean NOT NULL DEFAULT false,
 not_rechecked_since date,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT merchant_change_cases_merchant_id_unique UNIQUE (merchant_id, id),
 CHECK ((status = 'resolved') = (resolution IS NOT NULL)),
 CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX merchant_change_cases_one_active ON merchant_change_cases(merchant_id, product_id, case_type) WHERE status = 'active';
CREATE INDEX merchant_change_cases_recent ON merchant_change_cases(merchant_id, last_changed_at DESC, id DESC);
CREATE INDEX merchant_change_cases_attention ON merchant_change_cases(merchant_id, priority, last_changed_at DESC, id DESC) WHERE status = 'active';
CREATE INDEX merchant_change_cases_product ON merchant_change_cases(merchant_id, product_id, last_changed_at DESC);
--> statement-breakpoint
CREATE TABLE merchant_change_transitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
 product_id uuid,
 node_key varchar(80) NOT NULL,
 from_version bigint,
 to_version bigint NOT NULL,
 before_value jsonb,
 after_value jsonb NOT NULL,
 before_readiness varchar(32),
 after_readiness varchar(32) NOT NULL,
 parent_transition_ids uuid[] NOT NULL DEFAULT '{}',
 run_id uuid NOT NULL,
 explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
 case_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT merchant_change_transitions_merchant_id_unique UNIQUE (merchant_id, id),
 CONSTRAINT merchant_change_transitions_run_fk FOREIGN KEY (merchant_id, run_id) REFERENCES merchant_change_runs(merchant_id, id),
 CONSTRAINT merchant_change_transitions_case_fk FOREIGN KEY (merchant_id, case_id) REFERENCES merchant_change_cases(merchant_id, id)
);
CREATE INDEX merchant_change_transitions_case ON merchant_change_transitions(merchant_id, case_id, created_at) WHERE case_id IS NOT NULL;
CREATE INDEX merchant_change_transitions_run ON merchant_change_transitions(merchant_id, run_id);
CREATE INDEX merchant_change_transitions_node ON merchant_change_transitions(merchant_id, product_id, node_key, created_at DESC);
CREATE INDEX merchant_change_transitions_retention ON merchant_change_transitions(created_at);
--> statement-breakpoint
-- Transitions are immutable history; retention may delete, nothing may edit.
CREATE FUNCTION merchant_change_transitions_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 RAISE EXCEPTION 'merchant_change_transitions rows are immutable';
END $$;
CREATE TRIGGER merchant_change_transitions_no_update BEFORE UPDATE ON merchant_change_transitions FOR EACH ROW EXECUTE FUNCTION merchant_change_transitions_immutable();
--> statement-breakpoint
-- Server-only access, consistent with 0031/0032/0033.
DO $$ DECLARE tab text; client_role text; BEGIN
 FOREACH tab IN ARRAY ARRAY['merchant_change_work','merchant_change_runs','merchant_change_events','merchant_change_states','merchant_change_cases','merchant_change_transitions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',tab);
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',tab,client_role);
 END IF;
 END LOOP;
 END LOOP;
END $$;
--> statement-breakpoint
-- Capture (§4.2). Each trigger's WHEN clause decides whether a write is
-- relevant; this function only records the event and advances the merchant's
-- work in the source transaction. It stores identifiers and column names only,
-- never row payloads. TG_ARGV lists the columns reported as changed on UPDATE.
CREATE FUNCTION change_capture() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
 old_row jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
 new_row jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
 row_data jsonb := coalesce(new_row, old_row);
 m uuid;
 fields text[] := '{}';
 old_product uuid;
 new_product uuid;
 rev bigint;
 col text;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  FOREACH col IN ARRAY TG_ARGV LOOP
   IF old_row -> col IS DISTINCT FROM new_row -> col THEN fields := fields || col; END IF;
  END LOOP;
 END IF;
 CASE TG_TABLE_NAME
  WHEN 'merchants' THEN
   m := (row_data ->> 'id')::uuid;
  WHEN 'merchant_cash_sale_items' THEN
   SELECT s.merchant_id INTO m FROM merchant_cash_sales s WHERE s.id = (row_data ->> 'cash_sale_id')::uuid;
   old_product := (old_row ->> 'product_id')::uuid;
   new_product := (new_row ->> 'product_id')::uuid;
  WHEN 'merchant_products' THEN
   m := (row_data ->> 'merchant_id')::uuid;
   old_product := (old_row ->> 'id')::uuid;
   new_product := (new_row ->> 'id')::uuid;
  ELSE
   m := (row_data ->> 'merchant_id')::uuid;
 END CASE;
 IF m IS NULL THEN RETURN NULL; END IF;
 INSERT INTO merchant_change_work AS w (merchant_id, requested_revision, last_requested_at) VALUES (m, 1, now())
 ON CONFLICT (merchant_id) DO UPDATE SET requested_revision = w.requested_revision + 1, last_requested_at = now()
 RETURNING w.requested_revision INTO rev;
 INSERT INTO merchant_change_events (merchant_id, revision, source_type, source_id, operation, changed_fields, old_product_id, new_product_id)
 VALUES (m, rev, TG_TABLE_NAME, (row_data ->> 'id')::uuid, lower(TG_OP), fields, old_product, new_product);
 RETURN NULL;
END $$;
--> statement-breakpoint
-- Indexes above exist before any capture trigger is created.
-- Operationally: ALTER TABLE <table> DISABLE TRIGGER <change_capture_*>.
CREATE TRIGGER change_capture_transactions_insert AFTER INSERT ON merchant_transactions FOR EACH ROW
 WHEN (NEW.status = 'finalized') EXECUTE FUNCTION change_capture();
CREATE TRIGGER change_capture_transactions_update AFTER UPDATE OF status, occurred_at ON merchant_transactions FOR EACH ROW
 WHEN ((OLD.status = 'finalized') IS DISTINCT FROM (NEW.status = 'finalized') OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at)
 EXECUTE FUNCTION change_capture('status', 'occurred_at');
CREATE TRIGGER change_capture_transactions_delete AFTER DELETE ON merchant_transactions FOR EACH ROW
 WHEN (OLD.status = 'finalized') EXECUTE FUNCTION change_capture();

CREATE TRIGGER change_capture_cash_sales_insert AFTER INSERT ON merchant_cash_sales FOR EACH ROW
 WHEN (NEW.status = 'recorded') EXECUTE FUNCTION change_capture();
CREATE TRIGGER change_capture_cash_sales_update AFTER UPDATE OF status, occurred_at ON merchant_cash_sales FOR EACH ROW
 WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.occurred_at IS DISTINCT FROM NEW.occurred_at)
 EXECUTE FUNCTION change_capture('status', 'occurred_at');
CREATE TRIGGER change_capture_cash_sales_delete AFTER DELETE ON merchant_cash_sales FOR EACH ROW
 WHEN (OLD.status = 'recorded') EXECUTE FUNCTION change_capture();

CREATE TRIGGER change_capture_cash_sale_items_update AFTER UPDATE OF product_id, quantity ON merchant_cash_sale_items FOR EACH ROW
 WHEN (OLD.product_id IS DISTINCT FROM NEW.product_id OR OLD.quantity IS DISTINCT FROM NEW.quantity)
 EXECUTE FUNCTION change_capture('product_id', 'quantity');
CREATE TRIGGER change_capture_cash_sale_items_delete AFTER DELETE ON merchant_cash_sale_items FOR EACH ROW
 EXECUTE FUNCTION change_capture();

CREATE TRIGGER change_capture_products_insert AFTER INSERT ON merchant_products FOR EACH ROW
 EXECUTE FUNCTION change_capture();
CREATE TRIGGER change_capture_products_update AFTER UPDATE OF on_hand_quantity, reserved_quantity, low_stock_threshold, status ON merchant_products FOR EACH ROW
 WHEN (OLD.on_hand_quantity IS DISTINCT FROM NEW.on_hand_quantity OR OLD.reserved_quantity IS DISTINCT FROM NEW.reserved_quantity
  OR OLD.low_stock_threshold IS DISTINCT FROM NEW.low_stock_threshold OR OLD.status IS DISTINCT FROM NEW.status)
 EXECUTE FUNCTION change_capture('on_hand_quantity', 'reserved_quantity', 'low_stock_threshold', 'status');
CREATE TRIGGER change_capture_products_delete AFTER DELETE ON merchant_products FOR EACH ROW
 EXECUTE FUNCTION change_capture();

CREATE TRIGGER change_capture_import_batches_update AFTER UPDATE OF status ON merchant_import_batches FOR EACH ROW
 WHEN (NEW.status = 'committed' AND OLD.status IS DISTINCT FROM 'committed')
 EXECUTE FUNCTION change_capture('status');

CREATE TRIGGER change_capture_merchants_update AFTER UPDATE OF timezone ON merchants FOR EACH ROW
 WHEN (OLD.timezone IS DISTINCT FROM NEW.timezone)
 EXECUTE FUNCTION change_capture('timezone');
