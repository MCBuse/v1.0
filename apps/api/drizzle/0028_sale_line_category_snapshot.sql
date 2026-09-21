-- The product category as it stood when the sale happened.
--
-- Without this, historical category reporting reads the product's *current*
-- category, so re-categorising a product silently rewrites last quarter's
-- figures. Existing rows stay NULL and continue to fall back to the current
-- category, labelled as such: backfilling them would invent a history we do
-- not have.
ALTER TABLE "merchant_invoice_items"
ADD COLUMN IF NOT EXISTS "category" varchar(100);

ALTER TABLE "merchant_cash_sale_items"
ADD COLUMN IF NOT EXISTS "category" varchar(100);
