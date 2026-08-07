-- The Bell's meter and its grant — stage B0.
--
-- Two tables, both SERVER-OWNED. The estate's own records live in `records` and
-- belong to the device; these two do not. They exist so the proxy can answer one
-- question before it spends money — "may this household ring, and how often has
-- it already?" — and a client that could write them could answer it for itself.
--
-- Nothing here holds conversation content. The Bell's history is session-scoped
-- and in-memory by design (assistant spec §3.2), so the only thing that survives
-- a ring is a token count. That is deliberate: less storage, less privacy
-- surface, and no sync design to argue about.
--
-- Paste into the Supabase SQL editor. There is no Supabase CLI in this project;
-- this file exists so the schema is in git and reviewable, not because anything
-- runs it automatically. Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- The meter
-- ---------------------------------------------------------------------------

-- One row per household per day. The day is a plain UTC date and NOT the user's
-- local day, which is a real (small) unfairness: someone on nights crosses UTC
-- midnight mid-shift and gets two half-allowances instead of one whole one. It
-- is accepted anyway, because the alternative is storing a timezone per user and
-- trusting the client to report it — and a cap that the metered party can shift
-- by lying about where they are is not a cap. Revisit only if the rope line
-- actually chafes.
-- Four token columns, not two. The whole cost argument for this feature rests on
-- prompt caching being ~10x cheaper on the read, so a meter that folds cached and
-- uncached input into one number cannot price a month — it can only estimate one.
-- The columns are cheap now and would be a migration later.
create table if not exists bell_usage (
  user_id     uuid   not null references auth.users on delete cascade,
  day         date   not null,
  msgs        int    not null default 0,
  tok_in      bigint not null default 0,  -- fresh input, charged at full rate
  tok_out     bigint not null default 0,
  tok_cache_r bigint not null default 0,  -- served from cache (~0.1x)
  tok_cache_w bigint not null default 0,  -- written to cache (~1.25x)
  primary key (user_id, day)
);

-- Adopt an earlier deploy that only had the two columns. Both no-ops on a fresh
-- database; both required if B0 ever shipped without them.
alter table bell_usage add column if not exists tok_cache_r bigint not null default 0;
alter table bell_usage add column if not exists tok_cache_w bigint not null default 0;

-- ---------------------------------------------------------------------------
-- The grant
-- ---------------------------------------------------------------------------

-- What the household is entitled to. A MISSING ROW IS NOT AN ERROR — the proxy
-- reads a missing grant as 'free', so a user who signs in and rings straight
-- away is metered rather than refused. Nothing has to provision this table for
-- the Bell to work; it only ever raises an allowance above the floor.
--
-- 'trial' and 'staff' have no meaning yet: the trial clock and the tier ladder
-- are stage B6. The column exists now so B6 is a read, not a migration.
create table if not exists bell_grants (
  user_id          uuid        primary key references auth.users on delete cascade,
  tier             text        not null default 'free'
                               constraint bell_grants_tier_check
                               check (tier in ('free', 'trial', 'staff', 'founder')),
  trial_started_at timestamptz,
  updated_at       timestamptz not null default now()
);

-- `create table if not exists` on an EXISTING table is a complete no-op — Postgres
-- notices the name is taken and ignores the rest of the definition, constraints
-- included. The assistant spec publishes a paste-able version of this same table
-- with no check constraint at all, so a database that ran that one would keep an
-- open-vocabulary `tier` column forever while this file claims to be idempotent.
-- Adopt it explicitly, the same way the two token columns above are adopted.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bell_grants_tier_check') then
    alter table bell_grants add constraint bell_grants_tier_check
      check (tier in ('free', 'trial', 'staff', 'founder'));
  end if;
end $$;

-- `updated_at` has to be maintained by something, or it is not an updated-at at
-- all — it is an inserted-at wearing a misleading name, and the first person to
-- audit "when was this household promoted?" gets a confident wrong answer. The
-- default only fills the insert; this fills every change after it.
create or replace function bell_touch_grant() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists bell_touch_grant_bu on bell_grants;
create trigger bell_touch_grant_bu before update on bell_grants
  for each row execute function bell_touch_grant();

-- ---------------------------------------------------------------------------
-- Row-level security: read your own, write nothing
-- ---------------------------------------------------------------------------

alter table bell_usage  enable row level security;
alter table bell_grants enable row level security;

-- Read-only, and only your own — so the app can one day show "3 of 10 calls
-- left, sir" without asking the server. There is deliberately NO insert, update
-- or delete policy on either table: with RLS on and no write policy, every
-- client write is refused, and the service_role key held by the proxy is the
-- only thing that can move these numbers. A meter the metered party can edit is
-- decoration.
drop policy if exists "read own usage" on bell_usage;
create policy "read own usage" on bell_usage
  for select using (auth.uid() = user_id);

drop policy if exists "read own grant" on bell_grants;
create policy "read own grant" on bell_grants
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- The increment
-- ---------------------------------------------------------------------------

-- Why this is an RPC and not an upsert, for the same reason `push_records` is:
-- PostgREST's .upsert() can only REPLACE a row, and this has to ADD to it. Two
-- rings arriving in the same second must both be counted, and a read-then-write
-- from the function would lose one of them. `on conflict do update` with the
-- addition inside it is a single statement, so the row is locked for the whole
-- of it and the arithmetic cannot interleave.
--
-- `security invoker` (the default) on purpose: the proxy calls this with the
-- service_role key, which bypasses RLS anyway, so there is nothing to gain from
-- `security definer` and something to lose — a definer function is a standing
-- offer to whoever can call it.
-- A changed argument list would OVERLOAD rather than replace, leaving an older
-- version callable — and still granted. Drop every shape this function has ever
-- had, by exact signature. All harmless on a database that never saw them.
drop function if exists bell_note_usage(uuid, bigint, bigint);
drop function if exists bell_note_usage(uuid, bigint, bigint, bigint, bigint);

-- `p_day` is supplied by the caller rather than derived here, and that is the
-- point of it. The proxy checks the allowance against the UTC day at the START of
-- the request and calls this after the reply is finished — seconds or minutes
-- later. If this function re-derived the day itself, a ring that began at
-- 23:59:58 would be checked against one row and increment a different one: the
-- decision would consult a counter the write never touches, and the count handed
-- back to the caller would describe a row that does not exist. One clock owns the
-- boundary for the whole request. The default keeps it callable by hand.
create or replace function bell_note_usage(
  p_user    uuid,
  p_in      bigint,
  p_out     bigint,
  p_cache_r bigint default 0,
  p_cache_w bigint default 0,
  p_day     date   default null
) returns void
language sql as $$
  insert into bell_usage (user_id, day, msgs, tok_in, tok_out, tok_cache_r, tok_cache_w)
  values (p_user, coalesce(p_day, (now() at time zone 'utc')::date), 1,
          greatest(p_in, 0), greatest(p_out, 0),
          greatest(p_cache_r, 0), greatest(p_cache_w, 0))
  on conflict (user_id, day) do update
    set msgs        = bell_usage.msgs        + 1,
        tok_in      = bell_usage.tok_in      + greatest(p_in, 0),
        tok_out     = bell_usage.tok_out     + greatest(p_out, 0),
        tok_cache_r = bell_usage.tok_cache_r + greatest(p_cache_r, 0),
        tok_cache_w = bell_usage.tok_cache_w + greatest(p_cache_w, 0);
$$;

-- PostgREST publishes every function it can see to whichever role holds EXECUTE,
-- and the default grant is PUBLIC. Without these three lines a signed-in browser
-- could POST to /rest/v1/rpc/bell_note_usage and inflate its own meter — or
-- anyone else's, since the user id is an argument. Revoke first, then grant to
-- exactly one role.
revoke execute on function bell_note_usage(uuid, bigint, bigint, bigint, bigint, date) from public;
revoke execute on function bell_note_usage(uuid, bigint, bigint, bigint, bigint, date) from anon, authenticated;
grant  execute on function bell_note_usage(uuid, bigint, bigint, bigint, bigint, date) to service_role;

-- ---------------------------------------------------------------------------
-- The spend alarm's raw material
-- ---------------------------------------------------------------------------

-- Fleet spend for a month, in tokens. Assistant spec §4.4 wants a scheduled
-- query that mails someone when the bill drifts; this is the query. It reads
-- across households, so it is service_role-only for the same reason the
-- increment is.
create or replace view bell_month_totals as
  select date_trunc('month', day)::date as month,
         count(distinct user_id)        as households,
         sum(msgs)                      as msgs,
         sum(tok_in)                    as tok_in,
         sum(tok_out)                   as tok_out,
         sum(tok_cache_r)               as tok_cache_r,
         sum(tok_cache_w)               as tok_cache_w
  from bell_usage
  group by 1;

revoke all on bell_month_totals from public;
revoke all on bell_month_totals from anon, authenticated;
grant  select on bell_month_totals to service_role;
