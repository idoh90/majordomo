-- Hardening, after a real failure.
--
-- The cold push (first sign-in, restored backup, cleared queue) writes to the
-- table directly rather than through push_records, and it did not stamp
-- `user_id`. The column is NOT NULL with no default, so every row was rejected
-- — which meant adoption threw, `adopted` never became true, the drain that
-- clears the queue was never reached, and the waiting counter sat there while
-- nothing ever left the device.
--
-- The client now stamps it, so this is not required. It exists so that the
-- database stops depending on the client to remember: any future writer that
-- forgets gets the signed-in user instead of an error.
--
-- Safe either way. Row-level security still checks auth.uid() = user_id on the
-- way in, so a client that stamps someone else's id is refused exactly as
-- before; the default only fills a blank.
--
-- Paste into the Supabase SQL editor. Optional, and idempotent.

alter table records alter column user_id set default auth.uid();
