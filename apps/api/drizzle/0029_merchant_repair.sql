ALTER TABLE financial_operations ADD COLUMN payment_intent_id varchar(255), ADD COLUMN refund_id varchar(255), ADD COLUMN refund_status varchar(64);
--> statement-breakpoint
CREATE TABLE chain_attempts (signature varchar(128) PRIMARY KEY, signed_transaction text NOT NULL, blockhash varchar(128) NOT NULL, last_valid_block_height bigint NOT NULL, network varchar(24) NOT NULL, status varchar(24) NOT NULL DEFAULT 'prepared', created_at timestamptz NOT NULL DEFAULT now());

--> statement-breakpoint
ALTER TABLE merchant_analytics_work ADD COLUMN generation bigint NOT NULL DEFAULT 1, ADD COLUMN claimed_generation bigint, ADD COLUMN lease_token uuid, ADD COLUMN lease_until timestamptz, ADD COLUMN next_attempt_at timestamptz;
--> statement-breakpoint
CREATE TABLE merchant_analytics_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE, generation bigint NOT NULL, reason text NOT NULL, source_type text NOT NULL, source_id text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX merchant_analytics_outbox_generation ON merchant_analytics_outbox(merchant_id,generation);
--> statement-breakpoint
CREATE FUNCTION enqueue_merchant_analytics(m uuid, why text, source text, reference text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE g bigint;
BEGIN
 INSERT INTO merchant_analytics_work(merchant_id,status,reasons) VALUES(m,'pending',jsonb_build_array(jsonb_build_object('reason',why,'sourceType',source,'sourceId',reference,'at',now())))
 ON CONFLICT(merchant_id) DO UPDATE SET generation=merchant_analytics_work.generation+1,last_queued_at=now(),
 status=CASE WHEN merchant_analytics_work.lease_until>now() THEN 'processing' ELSE 'pending' END,
 next_attempt_at=NULL, reasons=jsonb_build_array(jsonb_build_object('reason',why,'sourceType',source,'sourceId',reference,'at',now()))
 RETURNING generation INTO g;
 INSERT INTO merchant_analytics_outbox(merchant_id,generation,reason,source_type,source_id) VALUES(m,g,why,source,reference);
END $$;
--> statement-breakpoint
CREATE FUNCTION merchant_analytics_change_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM enqueue_merchant_analytics(NEW.merchant_id, TG_TABLE_NAME || '_' || lower(TG_OP), TG_TABLE_NAME, NEW.id::text);
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER analytics_sale_change AFTER INSERT OR UPDATE ON merchant_transactions FOR EACH ROW EXECUTE FUNCTION merchant_analytics_change_trigger();
CREATE TRIGGER analytics_cash_change AFTER INSERT OR UPDATE ON merchant_cash_sales FOR EACH ROW EXECUTE FUNCTION merchant_analytics_change_trigger();
CREATE TRIGGER analytics_stock_change AFTER INSERT OR UPDATE ON merchant_products FOR EACH ROW EXECUTE FUNCTION merchant_analytics_change_trigger();
CREATE TRIGGER analytics_import_change AFTER INSERT OR UPDATE ON merchant_import_batches FOR EACH ROW EXECUTE FUNCTION merchant_analytics_change_trigger();

--> statement-breakpoint
ALTER TABLE merchant_assessments ADD COLUMN idempotency_key varchar(128);
CREATE UNIQUE INDEX merchant_assessments_idempotency_unique ON merchant_assessments(merchant_id,idempotency_key);
