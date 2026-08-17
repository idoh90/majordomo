-- ENOUGH SUPABASE TO TEST AGAINST — the fixture the migrations run on locally.
--
-- Not a replica of the hosted project and not trying to be. It is the exact
-- surface the files in ../migrations/ actually lean on: the `auth` schema with
-- a users table for the foreign keys to point at, an `auth.uid()` the test can
-- steer, the three roles PostgREST publishes under with the default grants
-- Supabase hands them, and the realtime publication the migrations adopt tables
-- into. Nothing more, because anything more would be a second thing to keep
-- true.
--
-- The one substitution that matters: hosted `auth.uid()` reads a claim out of
-- the request JWT, and here it reads a session setting. For deciding a policy
-- those are the same function — which is what lets one psql session act as two
-- accounts in turn (`set role authenticated; set test.uid = '…'`).
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- roles are CLUSTER-wide, so a second database in the same cluster finds them
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null; end $$;

-- the steering wheel: Supabase's auth.uid() reads a request JWT claim; here it
-- reads a session setting, which is the same thing for policy purposes
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- realtime's publication, which the migrations adopt tables into. `wal_level`
-- is not `logical` on a throwaway cluster, so Postgres warns and creates it
-- anyway — which is all the migrations need, since they only ever check that a
-- table is a member.
do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;
