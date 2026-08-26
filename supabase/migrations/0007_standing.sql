-- A rank has to survive a round trip, or it is not a rank.
--
-- 0006 gave the crew ranks and a door, and left one way through both: LEAVING
-- was a DELETE of your own roster row, and `join_share`'s INSERT branch seats
-- whoever it does not already know as a `hand`. So the two acts a keeper has —
-- demote, and remove — were each undone by one round trip:
--
--   · A guest reads the code (every member can), presses LEAVE, types the code
--     back in, and returns an ACTIVE HAND. The demotion was a suggestion.
--   · A removed member does the same and walks straight back into an open crew.
--
-- The fix is to stop letting a departure erase the record of a rank. A roster
-- row is never deleted now; it changes STANDING:
--
--   pending  — applied to a vetted crew, waiting on the keeper
--   active   — on the crew
--   left     — stepped away; may come back, at the rank they left with
--   removed  — shown the door; only the keeper can undo it
--
-- `is_share_member` already means `status = 'active'`, so `left` and `removed`
-- read nothing, write nothing and appear on no roster. The row survives purely
-- so that the rank does.
--
-- Requires 0006. Idempotent — safe to re-run. Paste it IN FULL, and read
-- supabase/APPLY.md first: migrations here go FORWARD only.

-- ---------------------------------------------------------------------------
-- Two more standings
-- ---------------------------------------------------------------------------

alter table share_members drop constraint if exists share_members_status_check;
alter table share_members add constraint share_members_status_check
  check (status in ('pending', 'active', 'left', 'removed'));

-- ---------------------------------------------------------------------------
-- Leaving, without a DELETE
-- ---------------------------------------------------------------------------

-- DEFINER, and this is the reason: a member has to be able to change ONE column
-- of their OWN row, and RLS has no column granularity. An UPDATE policy wide
-- enough to let them step away would be wide enough to let them write their own
-- `role`, because the column grant is not per-policy. A function that touches
-- exactly one column, for exactly the caller, needs no policy at all.
--
-- The keeper is refused: a crew cannot be left ownerless, and DISBAND is the
-- door they have. `guard_keeper_row` would refuse it anyway; saying so here
-- makes the error legible.
create or replace function leave_share(p_share uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from shares where id = p_share and owner_id = auth.uid()) then
    raise exception 'the keeper cannot leave a crew; disband it instead';
  end if;
  update share_members
     set status = 'left'
   where share_id = p_share
     and user_id = auth.uid()
     and status <> 'removed';   -- being shown the door is not something to undo
end $$;

-- ---------------------------------------------------------------------------
-- …and nothing deletes a roster row any more
-- ---------------------------------------------------------------------------

-- Removing someone, and turning an applicant away, are both `status = 'removed'`
-- now, which the keeper's existing UPDATE policy and column grant already allow.
-- With no DELETE left that anyone needs, the policy goes: a row that can be
-- deleted is a rank that can be erased, and that was the whole hole.
--
-- Disbanding is unaffected. `delete from shares` clears the roster through the
-- FK cascade, and referential-integrity actions do not consult RLS — which the
-- registry harness proves on every run rather than taking on trust.
drop policy if exists "leave or kick" on share_members;

-- ---------------------------------------------------------------------------
-- Knocking is not a promotion
-- ---------------------------------------------------------------------------

-- The output column is `joined_share`, NOT `share_id` — see 0006. Naming it
-- after a real column makes the ON CONFLICT clause below ambiguous and nobody
-- can join at all.
create or replace function join_share(p_code text, p_label text)
returns table (joined_share uuid, member_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_vis text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select id, visibility into v_id, v_vis from shares
    where shares.code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if v_id is null then
    raise exception 'no such crew';
  end if;
  insert into share_members (share_id, user_id, label, role, status)
    values (v_id, auth.uid(), p_label, 'hand',
            case when v_vis = 'vetted' then 'pending' else 'active' end)
    on conflict (share_id, user_id) do update
      set label  = excluded.label,
          -- A RANK IS NEVER RE-GRANTED BY KNOCKING. Stated as an explicit
          -- self-assignment rather than left out: someone editing this later
          -- reaches for `excluded.role`, and that is the bug this file exists
          -- to close.
          role   = share_members.role,
          status = case
                     -- shown the door: only the keeper undoes that
                     when share_members.status = 'removed' then 'removed'
                     -- an open crew takes anyone else back at once
                     when v_vis <> 'vetted' then 'active'
                     -- vetted: already in stays in, everyone else waits
                     when share_members.status = 'active' then 'active'
                     else 'pending'
                   end
    returning share_members.status into v_status;
  return query select v_id, v_status;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function leave_share(uuid) from public, anon;
grant  execute on function leave_share(uuid) to authenticated;

revoke execute on function join_share(text, text) from public, anon;
grant  execute on function join_share(text, text) to authenticated;
