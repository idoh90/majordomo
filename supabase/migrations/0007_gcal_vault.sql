-- ---------------------------------------------------------------------------
-- 0007 — the Google refresh token leaves the table.
--
-- Paste into the Supabase SQL editor BY HAND, like every migration here, and
-- IN FULL. Nothing runs this automatically. Idempotent — safe to re-run.
--
-- WHAT 0006 GOT WRONG
--
-- 0006 reasoned correctly about WHO may read `gcal_accounts` — RLS on, zero
-- policies, every grant revoked, service_role the only door — and then stored
-- the credential itself as ordinary `text` in the API schema. Two holes follow
-- from that, and neither is closed by a grant:
--
--   1. A backup is a copy of the table. `pg_dump`, a PITR restore, a branch
--      taken for a bug hunt, a CSV a future me exports at 1 a.m. — every one
--      of them carries a live refresh token that reads the user's calendars
--      for as long as Google honours it. Nothing about the row's permissions
--      travels with the bytes.
--   2. The revokes are one `grant` away from gone. The plausible future move
--      is not malice, it is convenience: someone adds
--      `grant select on gcal_accounts to authenticated` plus a
--      `using (user_id = auth.uid())` policy so a device can read its own
--      connection state without a round trip through `api/`, and publishes a
--      long-lived Google credential to every browser holding a session.
--
-- WHAT THIS DOES
--
-- The token moves into Supabase Vault. The table keeps a `refresh_token_id`
-- uuid — a POINTER, not a credential: the ciphertext lives in `vault.secrets`
-- and the key that opens it is held by the platform, outside the database and
-- outside its dumps. So a backup now carries a pointer and an unreadable blob,
-- and the convenience-grant above would publish a uuid.
--
-- `vault` is not an exposed schema, so PostgREST cannot reach it at all. The
-- endpoint's only path to plaintext is `gcal_refresh_token()` below: one
-- security-definer function, granted to service_role and revoked from everyone
-- else. That is the whole audit surface — one function, named after what it
-- does, and if it is ever granted more widely the grep is a single word.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- `google_email` stays in the table as plaintext. It is a display label — the
-- CALENDARS sheet's "connected as …" line and nothing else; the consent walk's
-- `login_hint` comes from the household's own Supabase email, never from here.
-- It is not a credential, the same person's address already sits in plaintext
-- in `auth.users`, and under the threat model above — a stray backup, a
-- careless future grant — an email address costs the user their privacy in a
-- way a refresh token costs them their calendar. Encrypting it would buy
-- nothing the zero-policy table does not already provide and would blind an
-- operator trying to work out whose connection is broken. If that trade ever
-- changes, the machinery below takes a second secret without redesign.
--
-- ORDER OF OPERATIONS — this migration and the deploy of `api/google.ts` that
-- goes with it are a PAIR, and between them the connect/refresh door is shut:
-- the old code selects a column this drops, the new code calls functions this
-- creates. Paste this first, then deploy. The window costs a failed SYNC NOW
-- and nothing else — no estate data passes through here, and a household whose
-- token is momentarily unreachable reconnects by walking the same consent door.
--
-- ONE THING SQL CANNOT DO FOR YOU: dropping a column does not erase the bytes
-- already written into the table's dead tuples. If this table ever held rows
-- with plaintext tokens, run `vacuum full public.gcal_accounts;` afterwards —
-- on its own, outside any transaction — to force the rewrite. As of writing the
-- table has never held a row, so this is insurance, not a step.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 0. Vault has to be there
-- ---------------------------------------------------------------------------

-- Fail loudly and early rather than half-landing. A migration that creates the
-- pointer column and then cannot create the secret would leave the endpoint
-- writing connections it can never read back — the exact silent-breakage shape
-- 0005 was written to end.
do $$
begin
  if to_regnamespace('vault') is null then
    raise exception
      'supabase_vault is not installed. Enable it (Database -> Extensions -> supabase_vault) and re-run this file.';
  end if;
  if to_regclass('vault.secrets') is null then
    raise exception
      'vault.secrets is missing. The supabase_vault extension is not fully installed; re-enable it and re-run this file.';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 1. The pointer column
-- ---------------------------------------------------------------------------

alter table public.gcal_accounts
  add column if not exists refresh_token_id uuid;

comment on column public.gcal_accounts.refresh_token_id is
  'Pointer into vault.secrets. Not a credential: decrypting it needs the vault key, which lives outside this database. The only reader is public.gcal_refresh_token().';

-- No foreign key to `vault.secrets` on purpose. The vault is another
-- extension's table and its shape is not ours to constrain; a stale pointer is
-- handled where it is read (it reads as "not connected", which is the truth),
-- and a dangling reference cannot leak anything.


-- ---------------------------------------------------------------------------
-- 2. The internal: put a token in the vault, return where it went
-- ---------------------------------------------------------------------------

-- Find-or-create-or-update, and every branch of it exists because of a real
-- way the pair of rows can drift apart:
--
--   · the row points at a secret that is gone (a delete that half-landed, a
--     vault restored from an older snapshot) — forget the pointer, make a new
--     secret;
--   · no pointer, but a secret already sits under this household's
--     deterministic name (the same half-landed delete, seen from the other
--     side) — adopt it rather than colliding with its unique name;
--   · neither — create.
--
-- The name is `gcal_refresh:<user id>` so an operator reading `vault.secrets`
-- can tell what a secret is FOR without being able to tell what it IS.
--
-- Granted to NOBODY. It takes a plaintext token as an argument, so the only
-- callers it may ever have are the two security-definer functions below, which
-- run as this function's owner and therefore need no grant.
create or replace function public.gcal_store_secret(p_user uuid, p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := 'gcal_refresh:' || p_user::text;
  v_desc text := 'Majordomo - Google Calendar refresh token';
  v_id   uuid;
begin
  if p_token is null or length(btrim(p_token)) = 0 then
    raise exception 'gcal_store_secret: refusing to store an empty refresh token';
  end if;

  select a.refresh_token_id into v_id
    from public.gcal_accounts a
   where a.user_id = p_user;

  if v_id is not null and not exists (select 1 from vault.secrets s where s.id = v_id) then
    v_id := null;
  end if;

  if v_id is null then
    select s.id into v_id from vault.secrets s where s.name = v_name;
  end if;

  if v_id is null then
    v_id := vault.create_secret(p_token, v_name, v_desc);
  else
    perform vault.update_secret(v_id, p_token, v_name, v_desc);
  end if;

  return v_id;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Connect — the consent walk came home
-- ---------------------------------------------------------------------------

-- Replaces the upsert `api/google.ts` used to do against the table directly.
-- The secret and the row land in ONE statement's worth of work: there is no
-- moment where a household is on record as connected with nothing to refresh
-- from, and no moment where a secret exists that nothing points at.
--
-- `calendar_id` is deliberately absent from the conflict clause, carrying 0006's
-- rule forward verbatim: a RECONNECT must not forget the Majordomo calendar the
-- account already has.
--
-- `google_email` is written as given, null included — identical to the upsert
-- this replaces. A walk that produced no id_token email genuinely does not know
-- the label any more, and printing a stale one would be a worse answer.
create or replace function public.gcal_connect(p_user uuid, p_token text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.gcal_store_secret(p_user, p_token);

  insert into public.gcal_accounts (user_id, google_email, refresh_token_id)
  values (p_user, p_email, v_id)
  on conflict (user_id) do update
    set google_email     = excluded.google_email,
        refresh_token_id = excluded.refresh_token_id;
end $$;


-- ---------------------------------------------------------------------------
-- 4. Rotate — Google handed back a new token inside a refresh grant
-- ---------------------------------------------------------------------------

-- Deliberately NOT an upsert. A rotation is an edit to a connection that
-- already exists; if the row is gone (the household disconnected on another
-- device between the grant and this write) the honest outcome is that nothing
-- happens, not that a disconnected account quietly reconnects itself.
create or replace function public.gcal_rotate_token(p_user uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.gcal_accounts a where a.user_id = p_user) then
    return;
  end if;

  v_id := public.gcal_store_secret(p_user, p_token);

  update public.gcal_accounts
     set refresh_token_id = v_id
   where user_id = p_user
     and refresh_token_id is distinct from v_id;
end $$;


-- ---------------------------------------------------------------------------
-- 5. Read — the ONE path to plaintext
-- ---------------------------------------------------------------------------

-- Everything this migration is about comes down to who may execute this
-- function. It is the only object in the database that turns a user id into a
-- Google refresh token, it is granted to service_role and nothing else, and it
-- is called from exactly two places in `api/google.ts`: minting an access token,
-- and revoking at Google on the way out.
--
-- A null answer means one of two things and both read the same way to the
-- endpoint: there is no connection, or the row points at a secret that is no
-- longer there. Neither can be refreshed, and the remedy for both is the
-- consent door.
create or replace function public.gcal_refresh_token(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
    from public.gcal_accounts a
    join vault.decrypted_secrets d on d.id = a.refresh_token_id
   where a.user_id = p_user;
$$;


-- ---------------------------------------------------------------------------
-- 6. Forgetting — the secret follows the row out
-- ---------------------------------------------------------------------------

-- A trigger rather than a step inside `disconnect`, because a row can leave
-- this table by a route the endpoint knows nothing about: `user_id` cascades
-- from `auth.users`, so deleting an account in the Supabase dashboard drops
-- the connection and would otherwise strand its secret in the vault forever.
--
-- It SWALLOWS its own failure, and that is a deliberate choice between two
-- kinds of bad. A trigger that raises would abort the delete that fired it —
-- including a cascade from `auth.users`, which would make deleting an account
-- impossible because of a calendar table. What it leaves behind when it fails
-- is an encrypted string nothing references, already revoked at Google by the
-- endpoint before the row went; and the adopt-by-name branch in
-- `gcal_store_secret` reuses it the moment that household reconnects. Litter
-- that self-heals beats an account that cannot be deleted.
create or replace function public.gcal_forget_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.refresh_token_id is not null then
    begin
      delete from vault.secrets where id = old.refresh_token_id;
    exception when others then
      null;
    end;
  end if;
  return old;
end $$;

drop trigger if exists gcal_forget_secret_ad on public.gcal_accounts;
create trigger gcal_forget_secret_ad after delete on public.gcal_accounts
  for each row execute function public.gcal_forget_secret();


-- ---------------------------------------------------------------------------
-- 7. Carry any existing rows across, then take the column away
-- ---------------------------------------------------------------------------

-- Guarded on the column still existing so a re-run is a no-op rather than an
-- error. As of writing this table has never held a row, so the loop below is
-- insurance against a paste that arrives later than it should have.
do $$
declare
  r record;
  v_id uuid;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'gcal_accounts'
       and column_name  = 'refresh_token'
  ) then
    return;
  end if;

  for r in execute
    'select user_id, refresh_token from public.gcal_accounts
      where refresh_token is not null and btrim(refresh_token) <> '''' and refresh_token_id is null'
  loop
    v_id := public.gcal_store_secret(r.user_id, r.refresh_token);
    update public.gcal_accounts set refresh_token_id = v_id where user_id = r.user_id;
  end loop;

  -- Only now, with every token that existed sitting in the vault, does the
  -- plaintext column go. A row that had no usable token had nothing to carry
  -- across and is left pointing at nothing, which reads as "reconnect".
  execute 'alter table public.gcal_accounts drop column refresh_token';
end $$;


-- ---------------------------------------------------------------------------
-- 8. Who may call any of this
-- ---------------------------------------------------------------------------

-- 0005's reasoning, and it applies harder here. PostgREST publishes every
-- function it can see to whichever role holds EXECUTE, and the default grant is
-- PUBLIC. All of these take a user id as an ARGUMENT — a signed-in browser
-- holding EXECUTE on `gcal_refresh_token` could read ANY household's Google
-- credential, which would be a worse hole than the one this file closes.
-- Revoke first, then grant to exactly one role.
--
-- If these lines are the part of the file that does not land, the endpoint
-- cannot mint tokens and the bridge stops. That is the correct direction for
-- this error to run: a credential that cannot be read is not a credential
-- everyone can read.

revoke execute on function public.gcal_store_secret(uuid, text)  from public;
revoke execute on function public.gcal_store_secret(uuid, text)  from anon, authenticated, service_role;

revoke execute on function public.gcal_connect(uuid, text, text) from public;
revoke execute on function public.gcal_connect(uuid, text, text) from anon, authenticated;
grant  execute on function public.gcal_connect(uuid, text, text) to   service_role;

revoke execute on function public.gcal_rotate_token(uuid, text)  from public;
revoke execute on function public.gcal_rotate_token(uuid, text)  from anon, authenticated;
grant  execute on function public.gcal_rotate_token(uuid, text)  to   service_role;

revoke execute on function public.gcal_refresh_token(uuid)       from public;
revoke execute on function public.gcal_refresh_token(uuid)       from anon, authenticated;
grant  execute on function public.gcal_refresh_token(uuid)       to   service_role;

revoke execute on function public.gcal_forget_secret()           from public;
revoke execute on function public.gcal_forget_secret()           from anon, authenticated;

-- 0006's posture, restated so this file stands on its own: the table itself is
-- still nobody's but service_role's. It no longer holds a credential, but it
-- holds who is connected and to which calendar, and that is not the Data API's
-- business either.
alter table public.gcal_accounts enable row level security;

revoke all on public.gcal_accounts from public;
revoke all on public.gcal_accounts from anon;
revoke all on public.gcal_accounts from authenticated;


-- ---------------------------------------------------------------------------
-- 9. Tell PostgREST
-- ---------------------------------------------------------------------------

-- Supabase reloads the schema cache on DDL by event trigger; saying so
-- explicitly costs nothing and saves the five minutes where a brand-new
-- function answers 404 and looks like a typo.
notify pgrst, 'reload schema';
