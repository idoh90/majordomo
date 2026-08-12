-- Collaborative ventures — the crew's shared space.
--
-- A share is a second, parallel namespace beside `records`, not a patch on it:
-- the estate's table is owner-scoped in five independent places (its PK, its
-- RLS, its push RPC, its realtime filter, its repair count), and loosening any
-- of them for sharing would loosen it for everything. So a shared venture's
-- rows live HERE, keyed by the share instead of the user, and membership is
-- the only credential. The backend stays exactly as ignorant as `records`
-- keeps it: `payload` is opaque jsonb, the client is the only reader.
--
-- What travels through a share: the venture's co-edited face (name, status,
-- goal), its pegboard cards and threads, its milestones, and a compact work
-- ledger (who worked, when, how long). What NEVER travels: calendar events
-- (a partner's sessions are their own Manor's business), fulfillment metadata,
-- and the bench timer (one device's present, not a record).
--
-- Requires 0001_records.sql to have run first: `stamp_record()` is reused —
-- it reads only NEW.server_seen_at / NEW.client_updated_at, so it is
-- table-agnostic on purpose.
--
-- Paste into the Supabase SQL editor, IN FULL — the 0003 lesson: the tables
-- can land while a grant does not, and that half-state serves happily while
-- quietly broken. Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- The tables
-- ---------------------------------------------------------------------------

create table if not exists shares (
  id         uuid        primary key default gen_random_uuid(),
  -- the join code IS the credential: whoever types it joins. Server-generated
  -- (see gen_share_code) from an alphabet with no 0/O/1/I/L, unique for as
  -- long as the share lives. Canonical form: 8 chars, no separators.
  code       text        not null unique,
  owner_id   uuid        not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists share_members (
  share_id  uuid        not null references shares on delete cascade,
  user_id   uuid        not null references auth.users on delete cascade,
  -- display name, chosen at join. Free text, self-asserted; auth.users is not
  -- readable across accounts, so the crew list needs its own labels.
  label     text        not null,
  joined_at timestamptz not null default now(),
  primary key (share_id, user_id)
);

-- "which crews am I in" — the membership reconcile's whole query
create index if not exists share_members_user_idx on share_members (user_id);

create table if not exists share_records (
  share_id          uuid        not null references shares on delete cascade,
  kind              text        not null,   -- 'venture'|'card'|'thread'|'milestone'|'work'
  -- NOT uuid, same rule as records: whatever the client calls it, we store
  id                text        not null,
  payload           jsonb,                  -- null iff deleted
  deleted           boolean     not null default false,
  -- who last wrote it — stamped by the push RPC, never by the client
  author_id         uuid,
  client_updated_at timestamptz not null,
  server_seen_at    timestamptz not null default clock_timestamp(),
  primary key (share_id, kind, id)
);

-- the pull cursor's index, per share
create index if not exists share_records_pull_idx on share_records (share_id, server_seen_at);

-- Two clocks, two jobs — identical discipline to `records`, same trigger fn.
drop trigger if exists stamp_share_record_biu on share_records;
create trigger stamp_share_record_biu before insert or update on share_records
  for each row execute function stamp_record();

-- ---------------------------------------------------------------------------
-- The recursion breakers
-- ---------------------------------------------------------------------------

-- RLS on share_members cannot itself consult share_members — Postgres refuses
-- the recursion. These run as DEFINER so the membership lookup bypasses RLS
-- *inside* the function while the policy that calls it stays caller-scoped.
-- STABLE lets the planner call each once per statement, not once per row.
-- `set search_path = public` because a definer function that trusts the
-- caller's search path is a standing offer to whoever can set one.
-- AFTER the tables on purpose: a `language sql` body is checked against the
-- catalog at CREATE time, so defining these first is a 42P01.
create or replace function is_share_member(p_share uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from share_members
    where share_id = p_share and user_id = auth.uid()
  );
$$;

create or replace function is_share_owner(p_share uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shares
    where id = p_share and owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table shares        enable row level security;
alter table share_members enable row level security;
alter table share_records enable row level security;

-- shares: members may look, only the owner may retire it. There is
-- deliberately NO insert or update policy — creation goes through
-- create_share, and nothing edits a share row after birth.
drop policy if exists "member reads share" on shares;
create policy "member reads share" on shares
  for select using (is_share_member(id) or owner_id = auth.uid());

drop policy if exists "owner retires share" on shares;
create policy "owner retires share" on shares
  for delete using (owner_id = auth.uid());

-- share_members: the roster is visible to the crew; leaving is deleting your
-- own row, kicking is the owner deleting someone else's. NO insert policy —
-- joining goes through join_share, because the code is the credential and a
-- plain insert would let anyone add themselves to any share id they guessed.
drop policy if exists "member reads roster" on share_members;
create policy "member reads roster" on share_members
  for select using (is_share_member(share_id));

drop policy if exists "leave or kick" on share_members;
create policy "leave or kick" on share_members
  for delete using (user_id = auth.uid() or is_share_owner(share_id));

-- share_records: the crew carries the records, full stop.
drop policy if exists "members carry records" on share_records;
create policy "members carry records" on share_records
  for all using (is_share_member(share_id)) with check (is_share_member(share_id));

-- ---------------------------------------------------------------------------
-- Realtime — a HINT, never a payload (same doctrine as records)
-- ---------------------------------------------------------------------------

-- `alter publication ... add table` raises on a table already published, which
-- would break re-running this file — adopt each explicitly.
do $$
begin
  begin
    alter publication supabase_realtime add table share_records;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table share_members;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- The doors: create and join
-- ---------------------------------------------------------------------------

-- 31 chars, no 0/O/1/I/L — a code someone reads aloud across a room must not
-- have two spellings. Collisions are retried by the caller's loop.
create or replace function gen_share_code() returns text
language plpgsql as $$
declare
  a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text := '';
  i int;
begin
  for i in 1..8 loop
    c := c || substr(a, 1 + floor(random() * 31)::int, 1);
  end loop;
  return c;
end $$;

-- DEFINER because shares has no insert policy on purpose: one door in, and
-- the membership row rides in the same transaction so a share can never exist
-- ownerless. The auth.uid() guard is what keeps DEFINER honest.
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
  insert into share_members (share_id, user_id, label)
    values (v_id, auth.uid(), p_label);
  return query select v_id, v_code;
end $$;

-- DEFINER because the joiner must find a share they cannot yet read — knowing
-- the code IS the authorization. Normalizes what a human actually types:
-- case, spaces, the display dashes.
create or replace function join_share(p_code text, p_label text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select id into v_id from shares
    where shares.code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if v_id is null then
    raise exception 'no such crew';
  end if;
  insert into share_members (share_id, user_id, label)
    values (v_id, auth.uid(), p_label)
    on conflict (share_id, user_id) do update set label = excluded.label;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- The hot push — same contract as push_records, per share
-- ---------------------------------------------------------------------------

-- An RPC for the same reason push_records is: the LWW guard is a WHERE on the
-- conflict clause, which PostgREST's .upsert() cannot express.
--
-- security invoker (the default) keeps RLS in force inside, so the membership
-- check cannot be argued with; `author_id` is stamped from auth.uid() so a
-- client cannot sign a partner's name to its own edits.
--
-- The client must DEDUPE the batch by (kind,id) before calling — Postgres
-- raises on intra-statement conflict duplicates.
--
-- RETURNING is the accepted set: a row absent from the result lost the LWW
-- argument, and the client re-pulls rather than assuming it won.
create or replace function push_share_records(p_share uuid, rows jsonb)
returns table (kind text, id text)
language sql as $$
  insert into share_records (share_id, kind, id, payload, deleted, author_id, client_updated_at)
  select p_share, r->>'kind', r->>'id',
         case when (r->>'deleted')::boolean then null else r->'payload' end,
         (r->>'deleted')::boolean,
         auth.uid(),
         (r->>'client_updated_at')::timestamptz
  from jsonb_array_elements(rows) r
  on conflict (share_id, kind, id) do update
    set payload           = excluded.payload,
        deleted           = excluded.deleted,
        author_id         = excluded.author_id,
        client_updated_at = excluded.client_updated_at
    where excluded.client_updated_at > share_records.client_updated_at
  returning share_records.kind, share_records.id;
$$;

-- ---------------------------------------------------------------------------
-- Grants — PostgREST publishes everything, so say exactly who may call what
-- ---------------------------------------------------------------------------

-- The helpers run inside policies as the signed-in caller, so `authenticated`
-- needs EXECUTE on them or every policy that uses them fails closed.
revoke execute on function is_share_member(uuid), is_share_owner(uuid) from public, anon;
grant  execute on function is_share_member(uuid), is_share_owner(uuid) to authenticated;

-- gen_share_code is create_share's private die — nobody rolls it directly.
revoke execute on function gen_share_code() from public, anon, authenticated;

revoke execute on function create_share(text) from public, anon;
revoke execute on function join_share(text, text) from public, anon;
revoke execute on function push_share_records(uuid, jsonb) from public, anon;
grant  execute on function create_share(text) to authenticated;
grant  execute on function join_share(text, text) to authenticated;
grant  execute on function push_share_records(uuid, jsonb) to authenticated;
