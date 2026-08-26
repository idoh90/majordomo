-- One door into a crew's records — and a code worth guessing less.
--
-- Requires 0008_code_privacy.sql. Paste into the Supabase SQL editor, IN FULL.
-- Idempotent — safe to re-run. Forward only: see APPLY.md.
--
-- THE PUSH RPC WAS NEVER THE ONLY DOOR. `push_share_records` stamps
-- `author_id` from `auth.uid()`, and the client's fold trusts that stamp to
-- decide whose work a ledger entry records — it is the whole reason a crewmate
-- cannot sign somebody else's name to an afternoon. But the RPC ran as the
-- CALLER, which means the caller had the table privileges to begin with, and
-- Supabase's default privileges hand `authenticated` every column of every new
-- table. 0004 revoked nothing. So a hand could skip the RPC entirely:
--
--   insert into share_records (…, author_id, …) values (…, '<someone else>', …)
--   update share_records set author_id = '<someone else>' where id = '<theirs>'
--   delete from share_records where …          -- no tombstone, so nobody learns
--
-- The first two forge authorship, which is exactly the thing the fold was
-- taught to check. The third is quieter and worse in its way: a hard DELETE
-- leaves no row for a cursor-based pull to carry, so the record simply stops
-- existing for the pusher and lives on forever on every other device. A crew's
-- records are meant to travel as TOMBSTONES, never as absences.
--
-- The fix is the one `records` has always had: revoke the table writes, and let
-- the RPC be a SECURITY DEFINER function that checks the rank itself. The
-- row-level write policies stay exactly where they are — they cost nothing and
-- they are what holds if a grant is ever handed back by accident.
--
-- The second half of the file is the join code's alphabet soup: `random()` is
-- not a cryptographic generator, and a join code is the sole write credential
-- for an open crew.

-- ---------------------------------------------------------------------------
-- The table stops taking writes
-- ---------------------------------------------------------------------------

-- SELECT stays: the pull reads this table directly, filtered by
-- `members read records`, and paging through it is most of what sync does.
revoke insert, update, delete on share_records from anon, authenticated;

-- ---------------------------------------------------------------------------
-- …so the RPC has to carry its own authority
-- ---------------------------------------------------------------------------

-- DEFINER, therefore the rank check is EXPLICIT. Under DEFINER the row policies
-- are not consulted, so `hands write records` is no longer what refuses a
-- guest — this line is. Say it once, first, and raise: a push that quietly
-- inserts nothing would have the client mark records as accepted.
--
-- `on conflict on constraint share_records_pkey` rather than
-- `on conflict (share_id, kind, id)`, and it is not a matter of taste. Every
-- name in a `returns table (...)` list becomes a plpgsql variable for the whole
-- body, a conflict target takes BARE column names with no qualified form
-- available, and this function returns columns called `kind` and `id`. Naming
-- them in the target would make every push raise `column reference "kind" is
-- ambiguous` — the exact failure `join_share` shipped with, and the reason
-- `check:registry` exists. The constraint name has no such collision.
create or replace function push_share_records(p_share uuid, rows jsonb)
returns table (kind text, id text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not is_share_writer(p_share) then
    raise exception 'not a writer on this crew';
  end if;
  return query
  insert into share_records (share_id, kind, id, payload, deleted, author_id, client_updated_at)
  select p_share, r->>'kind', r->>'id',
         case when (r->>'deleted')::boolean then null else r->'payload' end,
         (r->>'deleted')::boolean,
         auth.uid(),
         (r->>'client_updated_at')::timestamptz
  from jsonb_array_elements(rows) r
  on conflict on constraint share_records_pkey do update
    set payload           = excluded.payload,
        deleted           = excluded.deleted,
        author_id         = excluded.author_id,
        client_updated_at = excluded.client_updated_at
    where excluded.client_updated_at > share_records.client_updated_at
  returning share_records.kind, share_records.id;
end $$;

revoke execute on function push_share_records(uuid, jsonb) from public, anon;
grant  execute on function push_share_records(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- A code drawn from something that is actually random
-- ---------------------------------------------------------------------------

-- `random()` is a fast PRNG, not a cryptographic one, and a join code is the
-- sole write credential for an open crew: whoever types it is seated as a hand.
-- `gen_random_uuid()` is in core Postgres from 13 on and is drawn from a strong
-- source, so this needs no extension.
--
-- 31 symbols do not divide 256, so a raw byte modulo is very slightly biased
-- toward the first eight of them (~3%). That is written down rather than
-- engineered around: it costs an attacker nothing they did not already have
-- against a 40-bit space, and the real answer to a guessable code is now
-- ROTATION (0008), which this project did not have until today.
--
-- The alphabet is unchanged and stays that way: no 0/O/1/I/L, because a code
-- read aloud across a room must not have two spellings.
create or replace function gen_share_code() returns text
language plpgsql as $$
declare
  a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  c text := '';
  i int;
begin
  for i in 0..7 loop
    c := c || substr(a, 1 + (get_byte(b, i) % 31), 1);
  end loop;
  return c;
end $$;

revoke execute on function gen_share_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A label is a name, not a payload
-- ---------------------------------------------------------------------------

-- `label` is free text chosen by whoever is knocking, and it is written into
-- every crewmate's roster — which is to say into every crewmate's localStorage,
-- where the estate lives. Nothing bounded it. `rename_member` (0008) already
-- trims and caps; the two doors that also write a label must agree, or the cap
-- is a suggestion. An empty name is refused outright: the client will not offer
-- one, and a roster row with no name is a row nobody can act on.
create or replace function join_share(p_code text, p_label text)
returns table (joined_share uuid, member_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_vis text;
  v_status text;
  v_label text := left(btrim(p_label), 40);
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if v_label = '' then
    raise exception 'a name is required';
  end if;
  select id, visibility into v_id, v_vis from shares
    where shares.code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if v_id is null then
    raise exception 'no such crew';
  end if;
  insert into share_members (share_id, user_id, label, role, status)
    values (v_id, auth.uid(), v_label, 'hand',
            case when v_vis = 'vetted' then 'pending' else 'active' end)
    on conflict (share_id, user_id) do update
      set label  = excluded.label,
          -- a returning member NEVER re-earns a rank by knocking (0007)
          role   = share_members.role,
          status = case
                     when share_members.status = 'removed' then 'removed'
                     when v_vis <> 'vetted' then 'active'
                     when share_members.status = 'active' then 'active'
                     else 'pending'
                   end
    returning share_members.status into v_status;
  return query select v_id, v_status;
end $$;

revoke execute on function join_share(text, text) from public, anon;
grant  execute on function join_share(text, text) to authenticated;

create or replace function create_share(p_label text)
returns table (share_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_code text;
  v_label text := left(btrim(p_label), 40);
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if v_label = '' then
    raise exception 'a name is required';
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
    values (v_id, auth.uid(), v_label, 'keeper', 'active');
  return query select v_id, v_code;
end $$;

revoke execute on function create_share(text) from public, anon;
grant  execute on function create_share(text) to authenticated;
