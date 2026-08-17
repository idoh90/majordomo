-- The Household Registry — the estate's one table.
--
-- Every syncable thing in the app is a row here: an event, a workout, a
-- subject, a snapshot, one preference. The backend deliberately knows NOTHING
-- about any wing's shape — `payload` is opaque jsonb and the client is the only
-- thing that can read it. Same philosophy as core/backup.ts and adoptLegacyKey:
-- carry the bytes, let the client interpret them. A new wing needs no migration
-- here; it just starts emitting rows with a new `wing`/`kind`.
--
-- Paste into the Supabase SQL editor. There is no Supabase CLI in this project;
-- this file exists so the schema is in git and reviewable, not because anything
-- runs it automatically.

create table if not exists records (
  user_id           uuid        not null references auth.users on delete cascade,
  wing              text        not null,   -- 'shell'|'manor'|'grounds'|'study'|'ledger'
  kind              text        not null,   -- 'event'|'workout'|'subject'|'pref'|…
  -- NOT uuid: makeId() falls back off crypto.randomUUID, and pre-pivot blobs
  -- carry ids from older schemes. Whatever the client calls it, we store.
  id                text        not null,
  payload           jsonb,                  -- null iff deleted
  deleted           boolean     not null default false,
  client_updated_at timestamptz not null,
  server_seen_at    timestamptz not null default clock_timestamp(),
  primary key (user_id, wing, kind, id)
);

alter table records enable row level security;

-- The anon key ships in the browser bundle by design; RLS is the only guard
-- that matters. auth.uid() comes from the verified JWT, so a client cannot
-- reach another user's rows by asking nicely.
--
-- Dropped first so this file can be re-pasted, which is the only way a
-- migration is ever applied here. Without it a second paste aborts on this
-- line — after the table, before the trigger and the push RPC — which is the
-- half-applied state the whole ritual exists to avoid.
drop policy if exists "own rows" on records;
create policy "own rows" on records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- the pull cursor's index
create index if not exists records_pull_idx on records (user_id, server_seen_at);

-- Two clocks, two jobs.
--   server_seen_at    — OURS. Bumps on every accepted write; a client may never
--                       set it. This is what pulls page by, so a device with a
--                       skewed clock can't make another device miss rows.
--   client_updated_at — THEIRS. Decides LWW. Clamped to now so a device with a
--                       clock set to 2087 can't poison a row forever.
-- clock_timestamp(), not now(): now() is transaction start time, so a batch
-- would stamp every row identically and the cursor could straddle it.
create or replace function stamp_record() returns trigger language plpgsql as $$
begin
  new.server_seen_at    := clock_timestamp();
  new.client_updated_at := least(new.client_updated_at, clock_timestamp());
  return new;
end $$;

drop trigger if exists stamp_record_biu on records;
create trigger stamp_record_biu before insert or update on records
  for each row execute function stamp_record();

-- Realtime is only ever a HINT: the client reacts by scheduling a pull, never
-- by applying the payload. A socket that was disconnected can't tell you what
-- you missed; the cursor can.
--
-- `alter publication ... add table` raises on a table already published, so it
-- is adopted inside a block that swallows exactly that — the same shape 0004
-- uses, and for the same reason: a re-paste must be a no-op, not an abort.
do $$
begin
  alter publication supabase_realtime add table records;
exception when duplicate_object then null;
end $$;

-- The hot push.
--
-- This has to be an RPC because PostgREST's .upsert() cannot express a WHERE on
-- the conflict clause — and that WHERE is the whole point: it is the LWW guard
-- that stops a stale device from stomping a newer record.
--
-- security invoker (the default) keeps RLS in force inside the function, so
-- auth.uid() means the client cannot spoof user_id even though it supplies the
-- rest of the row.
--
-- The client must DEDUPE the batch by (wing,kind,id) before calling: Postgres
-- raises "ON CONFLICT DO UPDATE command cannot affect row a second time" on
-- intra-statement duplicates.
--
-- RETURNING tells the client which rows the guard ACCEPTED. A push that is
-- absent from the result was rejected as stale — the client re-pulls exactly
-- those rather than assuming it won.
create or replace function push_records(rows jsonb)
returns table (wing text, kind text, id text)
language sql as $$
  insert into records (user_id, wing, kind, id, payload, deleted, client_updated_at)
  select auth.uid(), r->>'wing', r->>'kind', r->>'id',
         case when (r->>'deleted')::boolean then null else r->'payload' end,
         (r->>'deleted')::boolean,
         (r->>'client_updated_at')::timestamptz
  from jsonb_array_elements(rows) r
  on conflict (user_id, wing, kind, id) do update
    set payload           = excluded.payload,
        deleted           = excluded.deleted,
        client_updated_at = excluded.client_updated_at
    where excluded.client_updated_at > records.client_updated_at
  returning records.wing, records.kind, records.id;
$$;

-- The cold push (first adopt, post-import, post-sign-in) needs no RPC — it is
-- insert-if-absent, never overwrite, which PostgREST expresses natively:
--   .upsert(rows, { onConflict: 'user_id,wing,kind,id', ignoreDuplicates: true })
-- A cold device has no idea when its records were really edited, so it is not
-- allowed to win an argument with the cloud. It may only fill gaps.
