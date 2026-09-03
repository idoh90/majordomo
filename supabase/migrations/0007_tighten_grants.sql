-- ---------------------------------------------------------------------------
-- 0007 — Tighten table grants: least-privilege DML, no dangerous DDL.
--
-- Problem (verified live 3 Sep 2026): roles `anon` and `authenticated` both
-- hold GRANT ALL — including TRUNCATE, REFERENCES, and TRIGGER — on these
-- public tables: records, waitlist, bell_grants, bell_usage, shares,
-- share_members, share_records. RLS is enabled on all of them and policies
-- exist, so this is not a live data leak today. But TRUNCATE is not RLS-bound
-- and the privilege set is far wider than PostgREST needs, so one policy
-- mistake becomes catastrophic.
--
-- This migration revokes TRUNCATE, REFERENCES, and TRIGGER from anon and
-- authenticated on those seven tables, and reduces remaining DML to the
-- minimum each role actually needs for the existing RLS policies to keep
-- working.
--
-- `gcal_accounts` is correctly service_role/postgres only; it is NOT touched.
--
-- Paste into the Supabase SQL editor, IN FULL. Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- records — the estate's sync table
-- ---------------------------------------------------------------------------

-- Client usage (via src/core/sync/transport.ts):
--   SELECT: pull(), countRecords()
--   INSERT/UPDATE: pushCold() via direct .upsert(), pushHot() via push_records RPC
--   (no direct DELETE — logical deletes via `deleted` flag)
-- RLS policy: "own rows" for all (SELECT/INSERT/UPDATE/DELETE on auth.uid() = user_id)
--
-- authenticated needs: SELECT, INSERT, UPDATE
-- anon needs: nothing (sign-in required)

revoke all on records from anon, authenticated;
grant select, insert, update on records to authenticated;

-- ---------------------------------------------------------------------------
-- bell_usage, bell_grants — the Bell's meter, server-owned
-- ---------------------------------------------------------------------------

-- Client usage (documented intent from 0003_bell.sql):
--   SELECT: app may one day show "3 of 10 calls left" without asking server
--   NO writes: "a meter the metered party can edit is decoration"
-- RLS policies: "read own usage" / "read own grant" for select only
--
-- authenticated needs: SELECT
-- anon needs: nothing (sign-in required for Bell)

revoke all on bell_usage from anon, authenticated;
revoke all on bell_grants from anon, authenticated;
grant select on bell_usage to authenticated;
grant select on bell_grants to authenticated;

-- ---------------------------------------------------------------------------
-- shares, share_members, share_records — collaborative ventures
-- ---------------------------------------------------------------------------

-- shares:
--   Client usage: SELECT (getShare), DELETE (deleteShare)
--   RLS policies: "member reads share" for select, "owner retires share" for delete
--   NO insert/update (creation via create_share RPC, immutable after birth)
-- authenticated needs: SELECT, DELETE
-- anon needs: nothing (sign-in required)

revoke all on shares from anon, authenticated;
grant select, delete on shares to authenticated;

-- share_members:
--   Client usage: SELECT (listMembers, listMemberships), DELETE (leave/kick)
--   RLS policies: "member reads roster" for select, "leave or kick" for delete
--   NO insert (joining via join_share RPC, code is credential)
-- authenticated needs: SELECT, DELETE
-- anon needs: nothing (sign-in required)

revoke all on share_members from anon, authenticated;
grant select, delete on share_members to authenticated;

-- share_records:
--   Client usage: SELECT (pullShare), INSERT/UPDATE (pushShareHot via RPC)
--   RLS policy: "members carry records" for all (full CRUD for crew)
--   (no direct DELETE in client, but policy allows it)
-- authenticated needs: SELECT, INSERT, UPDATE, DELETE
-- anon needs: nothing (sign-in required)

revoke all on share_records from anon, authenticated;
grant select, insert, update, delete on share_records to authenticated;

-- ---------------------------------------------------------------------------
-- waitlist — pre-launch signup table (per majordomo-landing-spec.md §7.3)
-- ---------------------------------------------------------------------------

-- Spec: "RLS: anon may INSERT only. No select, no update, no delete."
-- Waitlist form is public, no sign-in required.
-- authenticated gets same grant as anon (a signed-in visitor may still join).
--
-- anon needs: INSERT
-- authenticated needs: INSERT

revoke all on waitlist from anon, authenticated;
grant insert on waitlist to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verification note
-- ---------------------------------------------------------------------------

-- To verify these grants are correct, check the actual grants with:
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name IN ('records', 'bell_usage', 'bell_grants', 'shares',
--                        'share_members', 'share_records', 'waitlist')
--     AND grantee IN ('anon', 'authenticated')
--   ORDER BY table_name, grantee, privilege_type;
--
-- Expected result:
--   records:        authenticated {SELECT, INSERT, UPDATE}
--   bell_usage:     authenticated {SELECT}
--   bell_grants:    authenticated {SELECT}
--   shares:         authenticated {SELECT, DELETE}
--   share_members:  authenticated {SELECT, DELETE}
--   share_records:  authenticated {SELECT, INSERT, UPDATE, DELETE}
--   waitlist:       anon, authenticated {INSERT}
--
-- None should have TRUNCATE, REFERENCES, or TRIGGER.
-- gcal_accounts should have NO grants for anon or authenticated.
