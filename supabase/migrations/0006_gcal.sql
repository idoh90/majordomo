-- ---------------------------------------------------------------------------
-- 0006 — the Google Calendar bridge's custody table.
--
-- Paste into the Supabase SQL editor BY HAND, like every migration here, and
-- IN FULL. Nothing runs this automatically.
--
-- One row per household that has connected Google Calendar. The refresh token
-- is a CREDENTIAL: it can read the user's calendars for as long as Google
-- honours it, so this table gets no client policy, ever. RLS is enabled with
-- ZERO policies — anon and authenticated are refused outright — and the only
-- door is `api/google.ts`, server-side, holding the service_role key. The app
-- itself never sees a refresh token; it asks the endpoint for short-lived
-- access tokens and keeps them in memory.
--
-- `calendar_id` is the "Majordomo" calendar the app creates inside the user's
-- Google account (where the estate's own bookings are written). Stored here,
-- not on a device: it is a fact about the Google account, shared by every
-- device, and two devices racing to create it resolve by adopting whatever
-- this row already holds.
-- ---------------------------------------------------------------------------

create table if not exists gcal_accounts (
  user_id       uuid primary key references auth.users on delete cascade,
  google_email  text,
  refresh_token text not null,
  calendar_id   text,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- `updated_at` has to be maintained by something, or it is an inserted-at
-- wearing a misleading name (0003's reasoning, verbatim).
create or replace function gcal_touch_account() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists gcal_touch_account_bu on gcal_accounts;
create trigger gcal_touch_account_bu before update on gcal_accounts
  for each row execute function gcal_touch_account();

-- ---------------------------------------------------------------------------
-- Row-level security: nobody. RLS on with no policies refuses every anon and
-- authenticated request; service_role bypasses RLS by Postgres convention and
-- is the single intended reader and writer. The revoke is the belt over those
-- braces — a credential table should refuse twice.
-- ---------------------------------------------------------------------------

alter table gcal_accounts enable row level security;

revoke all on gcal_accounts from public;
revoke all on gcal_accounts from anon;
revoke all on gcal_accounts from authenticated;
