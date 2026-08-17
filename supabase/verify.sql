-- DID IT ALL LAND? — paste this whole file into the Supabase SQL editor after
-- applying a migration, and read the rows.
--
-- It exists because of the 0003 lesson, which this project has now learned
-- twice: a migration pasted in PART leaves a schema that serves happily and is
-- quietly broken. The tables land, a grant does not, and nothing complains
-- until a stranger can write to a crew they were told they could only read.
-- Every row below is one thing that must be true; FAILs sort to the top.
--
-- Safe to run any number of times. It reads catalogs and changes nothing.

with checks as (

  /* ---------------------------------------------------- 0006: the columns */
  select 'shares.visibility exists' as item,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'shares'
                    and column_name = 'visibility') as ok,
         'the door policy: open | vetted' as note
  union all
  select 'share_members.role exists',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'share_members'
                    and column_name = 'role'),
         'keeper | hand | guest'
  union all
  select 'share_members.status exists',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'share_members'
                    and column_name = 'status'),
         'pending | active — the waiting room'

  /* ------------------------------------------------ 0006: the constraints */
  union all
  select 'visibility is constrained',
         exists (select 1 from pg_constraint where conname = 'shares_visibility_check'),
         'without it a typo becomes a third door policy'
  union all
  select 'role is constrained',
         exists (select 1 from pg_constraint where conname = 'share_members_role_check'),
         'without it a typo becomes a rank nothing recognises'
  union all
  select 'status is constrained',
         exists (select 1 from pg_constraint where conname = 'share_members_status_check'),
         ''

  /* -------------------------------------------------- 0006: the functions */
  union all
  select 'is_share_member means ACTIVE member',
         coalesce(
           (select pg_get_functiondef(oid) from pg_proc
             where proname = 'is_share_member' and pronamespace = 'public'::regnamespace)
           like '%status = ''active''%', false),
         'if this FAILS, an applicant waiting at the door can read the records'
  union all
  select 'is_share_writer exists',
         to_regprocedure('public.is_share_writer(uuid)') is not null,
         'the rank check the record write policies make'
  union all
  select 'join_share answers with a standing',
         coalesce(
           (select pg_get_function_result(oid) from pg_proc
             where proname = 'join_share' and pronamespace = 'public'::regnamespace)
           like '%member_status%', false),
         'if this FAILS, the old single-column version is still in place and a vetted crew admits everyone'
  union all
  select 'create_share seats the keeper',
         coalesce(
           (select pg_get_functiondef(oid) from pg_proc
             where proname = 'create_share' and pronamespace = 'public'::regnamespace)
           like '%keeper%', false),
         'a new crew must be born with its owner ranked'

  /* ---------------------------------------------------- 0006: the trigger */
  union all
  select 'the keeper''s own row is guarded',
         exists (select 1 from pg_trigger
                  where tgname = 'guard_keeper_row_bu' and not tgisinternal),
         'stops a keeper demoting themselves into a crew they cannot write'

  /* --------------------------------------------------- 0006: the policies */
  union all
  select 'keeper may set the door policy',
         exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'shares'
                    and policyname = 'owner sets visibility'),
         ''
  union all
  select 'keeper may rank the crew',
         exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'share_members'
                    and policyname = 'keeper ranks the crew'),
         'admitting, promoting and demoting are all this one UPDATE'
  union all
  select 'an applicant may read their own row',
         coalesce((select qual from pg_policies
                    where schemaname = 'public' and tablename = 'share_members'
                      and policyname = 'member reads roster') like '%user_id%', false),
         'else a client cannot tell "still waiting" from "turned away"'
  union all
  select 'records: read is membership',
         exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'share_records'
                    and policyname = 'members read records'),
         ''
  union all
  select 'records: insert is rank',
         exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'share_records'
                    and policyname = 'hands write records'),
         ''
  union all
  select 'records: update is rank',
         exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'share_records'
                    and policyname = 'hands amend records'),
         ''
  union all
  select 'records: delete is rank',
         exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'share_records'
                    and policyname = 'hands strike records'),
         ''
  union all
  select 'the old blanket record policy is GONE',
         not exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'share_records'
                        and policyname = 'members carry records'),
         'THE ONE THAT MATTERS MOST: while it stands, every member may write and a guest is a guest in name only'

  /* -----------------------------------------------------  0006: the grants
   * `has_column_privilege` RAISES on a column that does not exist, which would
   * abort this whole file on a database where 0006 was never pasted — the exact
   * case it is here to diagnose. Asking it once per row of
   * information_schema.columns means an absent column yields no row, the
   * coalesce reads it as false, and the answer is a FAIL rather than an error. */
  union all
  select 'keeper may write shares.visibility',
         coalesce((select has_column_privilege('authenticated', 'public.shares', 'visibility', 'UPDATE')
                     from information_schema.columns
                    where table_schema = 'public' and table_name = 'shares'
                      and column_name = 'visibility'), false),
         ''
  union all
  select 'nobody may rewrite a join code',
         coalesce((select not has_column_privilege('authenticated', 'public.shares', 'code', 'UPDATE')
                     from information_schema.columns
                    where table_schema = 'public' and table_name = 'shares'
                      and column_name = 'code'), false),
         'if this FAILS the table-level UPDATE grant was never revoked'
  union all
  select 'keeper may write role + status',
         coalesce((select bool_and(has_column_privilege(
                            'authenticated', 'public.share_members', column_name, 'UPDATE'))
                     from information_schema.columns
                    where table_schema = 'public' and table_name = 'share_members'
                      and column_name in ('role', 'status')
                   having count(*) = 2), false),
         ''
  union all
  select 'nobody may rewrite a member''s own label',
         coalesce((select not has_column_privilege('authenticated', 'public.share_members', 'label', 'UPDATE')
                     from information_schema.columns
                    where table_schema = 'public' and table_name = 'share_members'
                      and column_name = 'label'), false),
         'if this FAILS the keeper can rename people'
  union all
  select 'authenticated may call is_share_writer',
         case when to_regprocedure('public.is_share_writer(uuid)') is null then false
              else has_function_privilege('authenticated', 'public.is_share_writer(uuid)', 'EXECUTE') end,
         'without EXECUTE every write policy using it fails closed'
  union all
  select 'authenticated may call join_share',
         case when to_regprocedure('public.join_share(text, text)') is null then false
              else has_function_privilege('authenticated', 'public.join_share(text, text)', 'EXECUTE') end,
         ''

  /* ------------------------------------------------------ 0006: the state */
  union all
  select 'every existing crew has a ranked keeper',
         -- `m.role` is read through to_jsonb rather than named directly: a
         -- column reference is resolved when this file is PARSED, so naming it
         -- would make the whole verification unrunnable on the one database
         -- that most needs verifying — the one where 0006 never landed
         not exists (
           select 1 from shares s
             join share_members m on m.share_id = s.id and m.user_id = s.owner_id
            where to_jsonb(m) ->> 'role' is distinct from 'keeper'),
         'the backfill; a crew whose owner reads as an ordinary hand cannot admit anyone'

  /* ------------------------------------ 0004, still load-bearing for 0006 */
  union all
  select 'realtime carries the roster',
         exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'share_members'),
         'how a device notices it was admitted, ranked or removed without waiting'
  union all
  select 'realtime carries the records',
         exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'share_records'),
         ''
)
select case when ok then 'PASS' else '>>> FAIL' end as result, item, note
  from checks
 order by ok, item;
