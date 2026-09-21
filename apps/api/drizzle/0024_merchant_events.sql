-- Durable merchant event log plus the request currently presented on a device.
-- Additive only.

CREATE TABLE IF NOT EXISTS "merchant_events" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"type" varchar(48) NOT NULL,
	"payment_request_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "merchant_events"
ADD CONSTRAINT "merchant_events_merchant_id_merchants_id_fk"
FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "merchant_events"
ADD CONSTRAINT "merchant_events_payment_request_id_payment_requests_id_fk"
FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "merchant_events_merchant_sequence_idx"
ON "merchant_events" ("merchant_id", "sequence");

CREATE INDEX "merchant_events_created_idx"
ON "merchant_events" ("created_at");

CREATE TABLE IF NOT EXISTS "merchant_presented_requests" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"payment_request_id" uuid NOT NULL,
	"presented_by_user_id" uuid NOT NULL,
	"presented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "merchant_presented_requests"
ADD CONSTRAINT "merchant_presented_requests_merchant_id_merchants_id_fk"
FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "merchant_presented_requests"
ADD CONSTRAINT "merchant_presented_requests_payment_request_id_payment_requests_id_fk"
FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "merchant_presented_requests"
ADD CONSTRAINT "merchant_presented_requests_presented_by_user_id_users_id_fk"
FOREIGN KEY ("presented_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "merchant_presented_requests_request_unique"
ON "merchant_presented_requests" ("payment_request_id");

-- Notify every API instance when a merchant event lands, so a connected
-- device is served by whichever instance it happens to be attached to.
CREATE OR REPLACE FUNCTION notify_merchant_event() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'merchant_events',
    json_build_object(
      'merchantId', NEW.merchant_id,
      'sequence', NEW.sequence::text,
      'type', NEW.type
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS merchant_events_notify ON "merchant_events";
CREATE TRIGGER merchant_events_notify
AFTER INSERT ON "merchant_events"
FOR EACH ROW EXECUTE FUNCTION notify_merchant_event();
