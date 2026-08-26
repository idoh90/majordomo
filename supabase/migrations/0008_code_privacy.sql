-- The join code is the keeper's to give — and to take back.
--
-- Requires 0007_standing.sql. Paste into the Supabase SQL editor, IN FULL.
-- Idempotent — safe to re-run. Forward only: see APPLY.md.
--
-- Two things were wrong with the code, and they are the same thing twice.
--
-- FIRST, EVERY MEMBER COULD READ IT. `member reads share` grants SELECT on the
-- whole `shares` row to anyone on the roster, and the row carries the code. So
-- a guest — the rank that exists precisely to change nothing — could open the
-- crew room, copy the invite link and hand it to a stranger, and `join_share`
-- would seat that stranger as a HAND. A read-only member could mint writers.
-- The screen showed the code to every rank because the registry did; the fix
-- has to be here, since a client that is persuaded not to display something is
-- not a permission.
--
-- SECOND, A LEAKED CODE WAS PERMANENT. 0006 revoked the table-level UPDATE on
-- `shares` and granted back only `visibility` — deliberately, so that nobody
-- could rewrite a code out from under the crew. The cost of that was never
-- stated: a code posted in the wrong group chat could not be changed by
-- anybody, including the keeper, and the only remedy was to disband the crew
-- and rebuild it. A credential with no revocation is not a credential.
--
-- The shape of the fix, in both cases, is the one this schema already uses for
-- `leave_share`: RLS has no column granularity, so a rule about ONE COLUMN
-- becomes a GRANT plus a SECURITY DEFINER function narrow enough to be safe.
-- `code` leaves the SELECT grant entirely and comes back only through
-- `share_code()`, which answers the keeper and nobody else; `rotate_share_code()`
-- writes a new one, and the table-level UPDATE stays revoked so that function
-- is the only way a code ever changes.
--
-- The third function here is the fallout. `announceName()` on the client used
-- to re-knock with the held code to change a display name — clever, and it
-- worked only because every member held the code. They no longer do, so a
-- member renaming themselves gets its own door: `rename_member()`, which
-- writes exactly one column of exactly its caller's own row.

-- ---------------------------------------------------------------------------
-- The code leaves the read grant
-- ---------------------------------------------------------------------------

-- `member reads share` stays as it is: WHICH ROWS a member may read is still a
-- policy. WHICH COLUMNS is a grant, and this is the whole of it. Supabase's
-- default privileges hand `authenticated` every column of every new table, so
-- the revoke is load-bearing and has to come first.
--
-- `created_at` is in the list because the crew room may one day want to say how
-- old a crew is; `code` is not, and that is the point of the file.
revoke select on shares from anon, authenticated;
grant  select (id, owner_id, visibility, created_at) on shares to authenticated;

-- ---------------------------------------------------------------------------
-- The keeper's own view of the code
-- ---------------------------------------------------------------------------

-- DEFINER so it can read the column nobody is granted; the owner_id check is
-- what keeps DEFINER honest, exactly as in create_share. It answers NULL rather
-- than raising for a share that does not exist or is not yours, because the
-- client asks this on every pull and a raise there is an error to handle rather
-- than an answer to read.
create or replace function share_code(p_share uuid) returns text
language sql stable security definer set search_path = public as $$
  select code from shares where id = p_share and owner_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Rotation
-- ---------------------------------------------------------------------------

-- Turns the lock. Nobody is evicted: standing lives on `share_members` and is
-- not re-derived from the code, so the crew wakes up unchanged and only the
-- links and slips of paper stop working. An application already lodged is
-- unaffected too — it is a roster row now, not a code.
--
-- The retry loop is create_share's, for the same one-in-31^8 reason.
create or replace function rotate_share_code(p_share uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from shares where id = p_share and owner_id = auth.uid()) then
    raise exception 'only the keeper may change a crew''s code';
  end if;
  loop
    v_code := gen_share_code();
    begin
      update shares set code = v_code where id = p_share;
      exit;
    exception when unique_violation then
      -- one in 31^8 — loop again
    end;
  end loop;
  return v_code;
end $$;

-- ---------------------------------------------------------------------------
-- A member's own name
-- ---------------------------------------------------------------------------

-- `label` is self-asserted and self-owned: the keeper must not be able to
-- rename people (0006 revokes the table UPDATE for exactly that reason, and
-- verify.sql asserts it), and a member must not gain a policy wide enough to
-- write their own `role` in the course of writing their own name. So this is
-- leave_share's shape: one column, one row, chosen by auth.uid() and not by an
-- argument.
--
-- A row in ANY standing may be renamed, including `pending` — someone at the
-- door correcting the name the keeper is about to read is the most useful case
-- there is — and including `left`, which costs nothing and keeps the rule
-- simple.
create or replace function rename_member(p_share uuid, p_label text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if coalesce(btrim(p_label), '') = '' then
    raise exception 'a name is required';
  end if;
  update share_members
     set label = left(btrim(p_label), 40)
   where share_id = p_share and user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Who may call them
-- ---------------------------------------------------------------------------

revoke execute on function share_code(uuid)               from public, anon;
revoke execute on function rotate_share_code(uuid)        from public, anon;
revoke execute on function rename_member(uuid, text)      from public, anon;
grant  execute on function share_code(uuid)               to authenticated;
grant  execute on function rotate_share_code(uuid)        to authenticated;
grant  execute on function rename_member(uuid, text)      to authenticated;
