-- The crew gains a door policy, a waiting room, and ranks.
--
-- 0004 gave a share exactly one credential — the code — and exactly one kind
-- of member. That is the right shape for two people building one thing, and
-- the wrong shape the moment a code is read aloud in a room, pasted into a
-- group chat, or handed to someone who should look but not touch. Three
-- columns close the gap:
--
--   shares.visibility        'open'   — the code admits, as it always did
--                            'vetted' — the code APPLIES; the keeper admits
--   share_members.status     'pending' | 'active'
--   share_members.role       'keeper' | 'hand' | 'guest'
--
-- The ranks are enforced HERE and not merely drawn in the app: `is_share_member`
-- now means an ACTIVE member (so an applicant waiting in the hall reads
-- nothing), and a new `is_share_writer` means an active keeper or hand — which
-- is what the share_records write policies check. A guest whose client is
-- persuaded to push is refused by the database, which is the only refusal worth
-- anything.
--
-- Two things stay out of RLS on purpose, because RLS has no column granularity:
-- WHICH columns the keeper may write is a GRANT (`role`, `status` on the
-- roster; `visibility` on the share), and the keeper's own place on the roster
-- is a trigger. Together they mean an owner can promote, demote, admit and
-- turn away, and cannot rename a member or quietly seize a crew.
--
-- Requires 0004_shares.sql. Idempotent — safe to re-run. Paste it into the
-- Supabase SQL editor IN FULL, the 0003 lesson: a half-pasted file leaves a
-- door that looks locked and is not.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table shares
  add column if not exists visibility text not null default 'open';

alter table share_members
  add column if not exists role   text not null default 'hand',
  add column if not exists status text not null default 'active';

-- Constraints added separately from the columns: `add column if not exists`
-- does not re-add a check to a column that already arrived, and a crew with a
-- typo'd rank is worse than one with none.
do $$
begin
  begin
    alter table shares add constraint shares_visibility_check
      check (visibility in ('open', 'vetted'));
  exception when duplicate_object then null;
  end;
  begin
    alter table share_members add constraint share_members_role_check
      check (role in ('keeper', 'hand', 'guest'));
  exception when duplicate_object then null;
  end;
  begin
    alter table share_members add constraint share_members_status_check
      check (status in ('pending', 'active'));
  exception when duplicate_object then null;
  end;
end $$;

-- Every crew that existed before this file has an owner sitting on the roster
-- as an ordinary hand. Say what they are, once.
update share_members m
   set role = 'keeper'
  from shares s
 where s.id = m.share_id
   and s.owner_id = m.user_id
   and m.role <> 'keeper';

-- the keeper's roster row is looked up on every write to share_members
create index if not exists share_members_pending_idx
  on share_members (share_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- The recursion breakers, restated
-- ---------------------------------------------------------------------------

-- MEMBER now means ACTIVE member. Everything downstream inherits it: an
-- applicant reads no records, no roster but their own row, and not even the
-- share's name — which is the point of a waiting room.
create or replace function is_share_member(p_share uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from share_members
    where share_id = p_share and user_id = auth.uid() and status = 'active'
  );
$$;

-- WRITER is the rank check the record policies make. A guest is a member by
-- every other measure and simply cannot put a hand on the board.
create or replace function is_share_writer(p_share uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from share_members
    where share_id = p_share
      and user_id = auth.uid()
      and status = 'active'
      and role in ('keeper', 'hand')
  );
$$;

-- ---------------------------------------------------------------------------
-- The keeper's own row is not editable — by anyone, including the keeper
-- ---------------------------------------------------------------------------

-- Without this, the one UPDATE policy below (owner may write role/status) is
-- also a way for an owner to demote themselves to guest and lock the crew:
-- `is_share_owner` would still be true, so they could climb back, but every
-- record write would be refused in the meantime and the reason would be
-- invisible. Cheaper to refuse the move.
--
-- UPDATE only, deliberately. Guarding DELETE would sit in the path of the
-- FK cascade that `delete from shares` fires on this table — the one operation
-- in the crew's whole life that must never fail — and the owner leaving their
-- own crew is already unreachable in the app: a keeper is offered DISBAND,
-- never LEAVE.
create or replace function guard_keeper_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from shares where id = NEW.share_id and owner_id = NEW.user_id)
     and (NEW.role <> 'keeper' or NEW.status <> 'active') then
    raise exception 'the keeper''s own place on the crew is not negotiable';
  end if;
  return NEW;
end $$;

drop trigger if exists guard_keeper_row_bu on share_members;
create trigger guard_keeper_row_bu before update on share_members
  for each row execute function guard_keeper_row();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

-- shares: unchanged for reading and retiring; the owner may now also set the
-- door policy. Which COLUMN that update may touch is the grant below, not this.
drop policy if exists "owner sets visibility" on shares;
create policy "owner sets visibility" on shares
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- share_members: an applicant must be able to read their OWN row, or a client
-- cannot tell "still waiting" from "turned away" — which are the only two
-- things it has to say while the keeper decides.
drop policy if exists "member reads roster" on share_members;
create policy "member reads roster" on share_members
  for select using (is_share_member(share_id) or user_id = auth.uid());

-- admitting, promoting, demoting — the keeper's three verbs, all one UPDATE.
-- Turning an applicant away is a DELETE and the 0004 policy already covers it.
drop policy if exists "keeper ranks the crew" on share_members;
create policy "keeper ranks the crew" on share_members
  for update using (is_share_owner(share_id)) with check (is_share_owner(share_id));

-- share_records: read is membership, write is rank. The single `for all`
-- policy 0004 wrote cannot express that, so it goes.
drop policy if exists "members carry records" on share_records;

drop policy if exists "members read records" on share_records;
create policy "members read records" on share_records
  for select using (is_share_member(share_id));

drop policy if exists "hands write records" on share_records;
create policy "hands write records" on share_records
  for insert with check (is_share_writer(share_id));

drop policy if exists "hands amend records" on share_records;
create policy "hands amend records" on share_records
  for update using (is_share_writer(share_id)) with check (is_share_writer(share_id));

drop policy if exists "hands strike records" on share_records;
create policy "hands strike records" on share_records
  for delete using (is_share_writer(share_id));

-- ---------------------------------------------------------------------------
-- The doors: create and join
-- ---------------------------------------------------------------------------

-- The keeper is stated at birth rather than inferred from shares.owner_id
-- every time a rank is read.
create or replace function create_share(p_label text)
returns table (share_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  loop
    v_code := gen_share_code();
    begin
      insert into shares (code, owner_id) values (v_code, auth.uid())
        returning id into v_id;
      exit;
    exception when unique_violation then
      -- one in 31^8 — loop again
    end;
  end loop;
  insert into share_members (share_id, user_id, label, role, status)
    values (v_id, auth.uid(), p_label, 'keeper', 'active');
  return query select v_id, v_code;
end $$;

-- The return type grows, so the old signature has to go first — Postgres will
-- not replace a function with one that returns something else.
drop function if exists join_share(text, text);

-- Redeeming a code no longer necessarily admits: on a vetted crew it lodges an
-- application and says so, and the caller's UI is expected to say "with the
-- keeper" rather than "joined". Still DEFINER, for the 0004 reason — the
-- applicant must find a share they cannot yet read.
--
-- The RETURNING is doing real work: after `on conflict do update` it reports
-- the row as it FINALLY stands, so someone already on the crew who re-types the
-- code is told they are on it, and an applicant who types it twice is told they
-- are still waiting. Nobody is ever demoted by knocking again.
--
-- THE OUTPUT COLUMN IS `joined_share`, NOT `share_id`, AND MUST STAY THAT WAY.
-- Every name in a `returns table (...)` list becomes a plpgsql variable for the
-- whole body, and `on conflict (share_id, user_id)` takes BARE column names —
-- there is no `share_members.share_id` form to disambiguate it with. Name the
-- output `share_id` and every call raises `column reference "share_id" is
-- ambiguous` at run time, which is to say: nobody can ever join. Renaming it
-- back to the prettier word breaks the one door this file exists to build.
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
          -- a crew that has since opened its door lets yesterday's applicants
          -- in; a vetted one leaves every standing rank exactly as it is
          status = case when v_vis = 'vetted' then share_members.status else 'active' end
    returning share_members.status into v_status;
  return query select v_id, v_status;
end $$;

-- ---------------------------------------------------------------------------
-- Grants — the column-level half of the policy
-- ---------------------------------------------------------------------------

revoke execute on function is_share_writer(uuid) from public, anon;
grant  execute on function is_share_writer(uuid) to authenticated;

-- RLS says WHO may update; these say WHAT. Without them the keeper's UPDATE
-- policy would also be a licence to rewrite a member's self-chosen label or
-- move their row to another crew.
revoke update on shares        from anon, authenticated;
revoke update on share_members from anon, authenticated;
grant  update (visibility)     on shares        to authenticated;
grant  update (role, status)   on share_members to authenticated;

revoke execute on function join_share(text, text) from public, anon;
grant  execute on function join_share(text, text) to authenticated;
