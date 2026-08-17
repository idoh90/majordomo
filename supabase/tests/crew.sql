-- Does the crew's door actually hold? Two accounts, every rank, every refusal.
--
-- The important lesson in the FIRST version of this file: an RLS-filtered
-- UPDATE or DELETE is not an error. It matches no visible rows and reports
-- success. So "it did not raise" proves nothing about a write policy — every
-- denial below is attempted as the role and then checked as the superuser, on
-- the state itself. Refusals that DO raise are recorded too, but the ground
-- truth is the row.

drop table if exists t;
create table t(item text, ok boolean, detail text);

create or replace function t_ok(p_item text, p_ok boolean, p_detail text default '')
returns void language sql as $$ insert into t values (p_item, coalesce(p_ok, false), p_detail); $$;

-- attempt something and remember only whether it raised; the caller checks the
-- state afterwards as postgres. The exception block is a subtransaction, so a
-- refusal rolls back to the savepoint and the session carries on.
create or replace function t_try(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return '';
exception when others then
  return 'refused: ' || split_part(sqlerrm, E'\n', 1);
end $$;

-- Every `select t_ok(...)` below returns one empty row, and forty-seven of
-- those buried the report. Output goes to the floor until the report itself.
-- `\gset` still works under this — it reads the result set rather than the
-- printed page, which is the whole reason it is safe to silence.
\o /dev/null

truncate share_members, share_records, shares cascade;
delete from auth.users;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set as_A 'set role authenticated; set test.uid = ''11111111-1111-1111-1111-111111111111'';'
\set as_B 'set role authenticated; set test.uid = ''22222222-2222-2222-2222-222222222222'';'

/* ============================================================ A opens a crew */
:as_A
select t_ok('A can open a crew', (select count(*) = 1 from create_share('ido')));
reset role;
select id as sid, code as scode from shares \gset
select t_ok('the crew is born OPEN', (select visibility = 'open' from shares where id = :'sid'));
select t_ok('A is seated as keeper',
            (select role = 'keeper' and status = 'active' from share_members
              where share_id = :'sid' and user_id = :'A'));

/* ================================================= an OPEN door admits at once */
:as_B
select t_ok('an open door admits at once',
            (select member_status = 'active' from join_share(:'scode', 'dana')));
reset role;
select t_ok('…and seats them as a hand',
            (select role = 'hand' and status = 'active' from share_members
              where share_id = :'sid' and user_id = :'B'));

/* ===================================================== a hand may write records */
:as_B
select t_ok('a hand may push a record', t_try(format(
  $q$ select push_share_records(%L, '[{"kind":"card","id":"c1","payload":{"t":"x"},"deleted":false,"client_updated_at":"2026-08-17T10:00:00Z"}]'::jsonb) $q$,
  :'sid')) = '');
reset role;
select t_ok('…and it landed', (select count(*) = 1 from share_records where share_id = :'sid'));

/* ============================================== the keeper shuts the door */
:as_A
select t_ok('keeper may vet the door', t_try(format(
  $q$ update shares set visibility = 'vetted' where id = %L $q$, :'sid')) = '');
select t_ok('keeper may NOT rewrite the code',
            t_try(format($q$ update shares set code = 'HACKED00' where id = %L $q$, :'sid')) <> '');
select t_ok('keeper may NOT rename a member',
            t_try(format($q$ update share_members set label = 'renamed'
                             where share_id = %L and user_id = %L $q$, :'sid', :'B')) <> '');
select t_ok('keeper may NOT demote themselves',
            t_try(format($q$ update share_members set role = 'guest'
                             where share_id = %L and user_id = %L $q$, :'sid', :'A')) <> '');
reset role;
select t_ok('…the door is vetted', (select visibility = 'vetted' from shares where id = :'sid'));
select t_ok('…the code is untouched', (select code = :'scode' from shares where id = :'sid'));
select t_ok('…the label is untouched',
            (select label = 'dana' from share_members where share_id = :'sid' and user_id = :'B'));
select t_ok('…the keeper is still keeper',
            (select role = 'keeper' from share_members where share_id = :'sid' and user_id = :'A'));

/* ===================================== B leaves, then knocks on a vetted door */
:as_B
select t_ok('a hand may leave', t_try(format(
  $q$ delete from share_members where share_id = %L and user_id = %L $q$, :'sid', :'B')) = '');
select t_ok('a vetted door only takes the name',
            (select member_status = 'pending' from join_share(:'scode', 'dana')));

/* ==================================== …and an applicant reads NOTHING at all */
select t_ok('an applicant reads no records',
            (select count(*) = 0 from share_records where share_id = :'sid'),
            'RLS scopes the select — no error, just no rows');
select t_ok('an applicant cannot read the crew row',
            (select count(*) = 0 from shares where id = :'sid'),
            'not even the crew''s existence');
select t_ok('an applicant sees only their own roster row',
            (select count(*) = 1 from share_members where share_id = :'sid'),
            'their own, so a client can say "still waiting"');
select t_ok('an applicant may NOT push', t_try(format(
  $q$ select push_share_records(%L, '[{"kind":"card","id":"c9","payload":{},"deleted":false,"client_updated_at":"2026-08-17T11:00:00Z"}]'::jsonb) $q$,
  :'sid')) <> '');
select t_ok('an applicant may NOT promote themselves',
            t_try(format($q$ update share_members set status = 'active', role = 'keeper'
                             where share_id = %L and user_id = %L $q$, :'sid', :'B')) is not null);
reset role;
select t_ok('…and is still only pending',
            (select status = 'pending' and role = 'hand' from share_members
              where share_id = :'sid' and user_id = :'B'));

/* ============================================================ the keeper admits */
:as_A
select t_ok('the keeper sees who is waiting',
            (select count(*) = 1 from share_members
              where share_id = :'sid' and status = 'pending'));
select t_ok('the keeper may admit', t_try(format(
  $q$ update share_members set status = 'active' where share_id = %L and user_id = %L $q$,
  :'sid', :'B')) = '');
:as_B
select t_ok('an admitted hand reads the records',
            (select count(*) = 1 from share_records where share_id = :'sid'));
select t_ok('an admitted hand reads the whole roster',
            (select count(*) = 2 from share_members where share_id = :'sid'));

/* =================================================== demoted to guest: read only */
:as_A
select t_ok('the keeper may demote to guest', t_try(format(
  $q$ update share_members set role = 'guest' where share_id = %L and user_id = %L $q$,
  :'sid', :'B')) = '');
:as_B
select t_ok('a guest still READS the records',
            (select count(*) = 1 from share_records where share_id = :'sid'));
select t_ok('a guest still reads the roster',
            (select count(*) = 2 from share_members where share_id = :'sid'));
select t_ok('a guest may NOT push', t_try(format(
  $q$ select push_share_records(%L, '[{"kind":"card","id":"c2","payload":{},"deleted":false,"client_updated_at":"2026-08-17T12:00:00Z"}]'::jsonb) $q$,
  :'sid')) <> '');
select t_try(format($q$ update share_records set payload = '{"t":"tampered"}'
                       where share_id = %L and id = 'c1' $q$, :'sid')) as amend_said \gset
select t_try(format($q$ delete from share_records where share_id = %L and id = 'c1' $q$, :'sid')) as strike_said \gset
select t_try(format($q$ update share_members set role = 'keeper'
                       where share_id = %L and user_id = %L $q$, :'sid', :'B')) as promote_said \gset
select t_try(format($q$ update shares set visibility = 'open' where id = %L $q$, :'sid')) as door_said \gset
reset role;
select t_ok('a guest may NOT amend a record',
            (select payload->>'t' = 'x' from share_records where share_id = :'sid' and id = 'c1'),
            coalesce(nullif(:'amend_said', ''), 'silently filtered — payload unchanged'));
select t_ok('a guest may NOT strike a record',
            (select count(*) = 1 from share_records where share_id = :'sid' and id = 'c1'),
            coalesce(nullif(:'strike_said', ''), 'silently filtered — record still there'));
select t_ok('a guest may NOT promote themselves',
            (select role = 'guest' from share_members where share_id = :'sid' and user_id = :'B'),
            coalesce(nullif(:'promote_said', ''), 'silently filtered — rank unchanged'));
select t_ok('a guest may NOT open the door',
            (select visibility = 'vetted' from shares where id = :'sid'),
            coalesce(nullif(:'door_said', ''), 'silently filtered — door unchanged'));
:as_B
select t_ok('a guest may still leave', t_try(format(
  $q$ delete from share_members where share_id = %L and user_id = %L $q$, :'sid', :'B')) = '');

/* ============================== knocking twice never costs a standing */
:as_A
select t_ok('the keeper re-typing their own code stays active',
            (select member_status = 'active' from join_share(:'scode', 'ido')));
reset role;
select t_ok('…and is still ranked keeper',
            (select role = 'keeper' from share_members where share_id = :'sid' and user_id = :'A'));

/* ================== opening the door lets yesterday's applicant in on the next knock */
:as_B
select t_ok('B applies again while vetted',
            (select member_status = 'pending' from join_share(:'scode', 'dana')));
select t_ok('a second knock does not lose the place',
            (select member_status = 'pending' from join_share(:'scode', 'dana')));
:as_A
select t_ok('keeper re-opens the door', t_try(format(
  $q$ update shares set visibility = 'open' where id = %L $q$, :'sid')) = '');
:as_B
select t_ok('an opened door lets the waiting applicant in',
            (select member_status = 'active' from join_share(:'scode', 'dana')));

/* ============================================================ a rank must exist */
reset role;
select t_ok('an invented rank is refused',
            t_try(format($q$ update share_members set role = 'admiral'
                             where share_id = %L and user_id = %L $q$, :'sid', :'B')) <> '',
            'the CHECK constraint, which not even the superuser may skip');

/* ===================================================== a bad code is an answer */
:as_B
select t_ok('an unknown code is refused',
            t_try($q$ select * from join_share('ZZZZZZZZ', 'dana') $q$) <> '');

/* ============ DISBANDING must never fail — the cascade crosses the keeper guard */
:as_A
select t_ok('the keeper may DISBAND', t_try(format(
  $q$ delete from shares where id = %L $q$, :'sid')) = '',
  'the cascade deletes the keeper''s own guarded row — this is the one that must never break');
reset role;
select t_ok('…and it took the roster with it',
            (select count(*) = 0 from share_members where share_id = :'sid'));
select t_ok('…and the records',
            (select count(*) = 0 from share_records where share_id = :'sid'));

\o
\pset format aligned
select case when ok then 'PASS' else '>>> FAIL' end as result, item, detail
  from t order by ok, ctid;
select count(*) filter (where not ok) as failures, count(*) as total from t;
