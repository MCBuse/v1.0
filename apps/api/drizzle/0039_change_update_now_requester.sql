-- Change Intelligence "Update now" (plan §8): the staff user who asked for the
-- pending run, carried from the request to the run row it produces. Cleared
-- when that run publishes. Additive only.

ALTER TABLE merchant_change_work ADD COLUMN requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
