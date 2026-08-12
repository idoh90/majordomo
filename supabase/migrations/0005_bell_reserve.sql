-- The Bell's rope line, rebuilt: RESERVE BEFORE SPEND.
--
-- 0003 metered the honest way round for a spike and the wrong way round for a
-- deployed endpoint: it READ the allowance before the reply and WROTE it after.
-- Two faults, one fix.
--
--   1. A write that failed permanently — the function absent because only part
--      of 0003 was pasted, or EXECUTE never granted — arrived AFTER the reply
--      had already been delivered and the money already spent. The failure was
--      logged and nothing else happened, so the endpoint went on serving, with
--      no second source of truth and no visible symptom. A broken meter became
--      an unlimited allowance on somebody's API key.
--   2. Read-then-write let several rings arriving together all see the same
--      last slot and all take it.
--
-- Both close if the decision and the record are the SAME statement, taken
-- before the model is called. `bell_reserve` resolves the household's ceiling
-- from its grant and claims a slot atomically; a full day returns `granted =
-- false` and claims nothing. The proxy treats anything other than an explicit
-- grant — including this function being absent, which is exactly what a partial
-- paste looks like — as a refusal.
--
-- The slot is claimed before the reply exists, so it has to be returnable:
-- `bell_release` hands it back when the ring generated nothing at all (a
-- mistyped model id, an upstream 529, an expired key). Counting those would let
-- five outages lock a household out of a service that never answered it once.
--
-- Token counts are no longer part of claiming a slot — they are not known until
-- the reply is finished. `bell_note_tokens` adds them to the row the
-- reservation already created, and adds nothing to `msgs`.
--
-- Paste into the Supabase SQL editor, IN FULL, after 0003. Idempotent — safe to
-- re-run. If only part of this file lands, the Bell refuses every ring rather
-- than serving unmetered, which is the correct direction for that error to run.

-- ---------------------------------------------------------------------------
-- Claim a slot
-- ---------------------------------------------------------------------------

-- The allowances are ARGUMENTS rather than constants here, because the operator
-- sets them in the proxy's environment (BELL_DAILY_FREE / BELL_DAILY_STAFF) and
-- one knob in one place beats the same number maintained in two. What is NOT an
-- argument is which of them applies: that reads the grant, inside the same
-- statement that claims the slot, so a household cannot be handed a ceiling by
-- the caller.
--
-- A changed argument list OVERLOADS rather than replaces, leaving an older
-- version callable and still granted. Dropped by exact signature first — a
-- no-op on a database that never saw one.
drop function if exists bell_reserve(uuid, date, int, int);

create or replace function bell_reserve(
  p_user   uuid,
  p_day    date,
  p_free   int,
  p_raised int
) returns table (granted boolean, used int, allowance int, grant_tier text)
language plpgsql as $$
declare
  v_tier    text;
  v_ceiling int;
  v_msgs    int;
begin
  select g.tier into v_tier from bell_grants g where g.user_id = p_user;
  v_tier := coalesce(v_tier, 'free');

  -- Named the wide way round on purpose, and this is the line that decides how
  -- the guard fails. `v_tier <> 'free'` reads identically and fails OPEN: a
  -- typo, a capital F, a tier invented by hand in the SQL editor would every
  -- one of them buy the larger allowance. The check constraint in 0003 is meant
  -- to make that unreachable, but a constraint can be missing from a table that
  -- already existed, and the one guard that stops money being spent should not
  -- depend on the other one having landed.
  v_ceiling := case
                 when v_tier in ('trial', 'staff', 'founder') then p_raised
                 else p_free
               end;

  -- An allowance of none is a coherent instruction — an operator closing the
  -- tap — and the insert below would quietly round it up to one.
  if v_ceiling < 1 then
    select u.msgs into v_msgs from bell_usage u
      where u.user_id = p_user and u.day = p_day;
    return query select false, coalesce(v_msgs, 0), v_ceiling, v_tier;
    return;
  end if;

  -- The whole rope line, in one statement. `on conflict ... do update` locks the
  -- row for the duration, so two rings arriving in the same millisecond are
  -- serialised rather than interleaved; the `where` makes the increment
  -- CONDITIONAL, so the one that finds the day full updates nothing and gets no
  -- row back. There is no window between deciding and recording, because there
  -- is no gap between them.
  insert into bell_usage (user_id, day, msgs)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update
    set msgs = bell_usage.msgs + 1
    where bell_usage.msgs < v_ceiling
  returning bell_usage.msgs into v_msgs;

  if v_msgs is null then
    -- The update was filtered out: the day is already full. Report the count
    -- that turned it away rather than a null.
    select u.msgs into v_msgs from bell_usage u
      where u.user_id = p_user and u.day = p_day;
    return query select false, coalesce(v_msgs, 0), v_ceiling, v_tier;
  else
    return query select true, v_msgs, v_ceiling, v_tier;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hand a slot back
-- ---------------------------------------------------------------------------

-- Only ever called when the ring produced NOTHING — no tokens in, none out, so
-- nothing was billed upstream either. `greatest(…, 0)` because a release that
-- raced something else must never drive the counter below zero and manufacture
-- an extra allowance.
drop function if exists bell_release(uuid, date);

create or replace function bell_release(
  p_user uuid,
  p_day  date
) returns void
language sql as $$
  update bell_usage
     set msgs = greatest(bell_usage.msgs - 1, 0)
   where bell_usage.user_id = p_user
     and bell_usage.day     = p_day;
$$;

-- ---------------------------------------------------------------------------
-- Record what it cost
-- ---------------------------------------------------------------------------

-- Adds tokens only. `msgs` was incremented by the reservation and must not be
-- touched again here, or every ring would count twice.
--
-- An UPDATE rather than an upsert, deliberately: the row is guaranteed to exist
-- because the reservation created it, and if it somehow does not, the honest
-- outcome is that no tokens are recorded — not that a fresh row appears with a
-- cost and no corresponding slot.
drop function if exists bell_note_tokens(uuid, date, bigint, bigint, bigint, bigint);

create or replace function bell_note_tokens(
  p_user    uuid,
  p_day     date,
  p_in      bigint default 0,
  p_out     bigint default 0,
  p_cache_r bigint default 0,
  p_cache_w bigint default 0
) returns void
language sql as $$
  update bell_usage
     set tok_in      = bell_usage.tok_in      + greatest(p_in, 0),
         tok_out     = bell_usage.tok_out     + greatest(p_out, 0),
         tok_cache_r = bell_usage.tok_cache_r + greatest(p_cache_r, 0),
         tok_cache_w = bell_usage.tok_cache_w + greatest(p_cache_w, 0)
   where bell_usage.user_id = p_user
     and bell_usage.day     = p_day;
$$;

-- ---------------------------------------------------------------------------
-- Who may call these
-- ---------------------------------------------------------------------------

-- PostgREST publishes every function it can see to whichever role holds EXECUTE,
-- and the default grant is PUBLIC. All three take a user id as an ARGUMENT, so
-- a signed-in browser holding EXECUTE could release its own slots forever, or
-- exhaust somebody else's. Revoke first, then grant to exactly one role.
--
-- If these three lines are the part of the file that does not land, the proxy's
-- reservation fails and every ring is refused. That is the intended direction:
-- a meter that cannot be written is not an unlimited allowance.
revoke execute on function bell_reserve(uuid, date, int, int)                        from public;
revoke execute on function bell_reserve(uuid, date, int, int)                        from anon, authenticated;
grant  execute on function bell_reserve(uuid, date, int, int)                        to   service_role;

revoke execute on function bell_release(uuid, date)                                  from public;
revoke execute on function bell_release(uuid, date)                                  from anon, authenticated;
grant  execute on function bell_release(uuid, date)                                  to   service_role;

revoke execute on function bell_note_tokens(uuid, date, bigint, bigint, bigint, bigint) from public;
revoke execute on function bell_note_tokens(uuid, date, bigint, bigint, bigint, bigint) from anon, authenticated;
grant  execute on function bell_note_tokens(uuid, date, bigint, bigint, bigint, bigint) to   service_role;

-- ---------------------------------------------------------------------------
-- What 0003 left behind
-- ---------------------------------------------------------------------------

-- `bell_note_usage` is superseded and the proxy no longer calls it: it bundles
-- an unconditional `msgs + 1` with the token write, which is precisely the shape
-- this migration exists to undo. It is left in place rather than dropped because
-- 0003 is idempotent and re-pasting it would put the function back anyway, and a
-- migration that fights the one before it is worse than a function nothing calls.
-- It is service_role-only, so nothing but this project's own server can reach it.
