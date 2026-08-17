#!/usr/bin/env node
/**
 * REGISTRY HARNESS — does the crew's door actually hold?
 *
 * Stands up a throwaway Postgres, applies every migration in `supabase/migrations`
 * in order against a Supabase-shaped fixture, then runs two files over it:
 *
 *   supabase/verify.sql        — did the schema land IN FULL (the partial-paste check)
 *   supabase/tests/crew.sql    — does it BEHAVE (two accounts, every rank, every refusal)
 *
 * Why this exists, and why it is not the repo's second test runner by accident:
 * the crew's contract is ACCESS CONTROL, and access control is the other kind of
 * thing — like the Manor's geometry — where "looks right" and "is right" come
 * apart completely. The first run of this harness found a migration in which
 * `join_share` raised `column reference "share_id" is ambiguous` on every call,
 * meaning nobody could join any crew at all. Nothing in the browser could have
 * shown that: the client was correct, the SQL parsed, the policies read well,
 * and the function had simply never been executed.
 *
 * Everything is thrown away at the end. It never touches the hosted project and
 * has no credentials to do so.
 *
 * Usage:
 *   npm run check:registry
 *
 * Needs Postgres BINARIES on the machine (initdb, pg_ctl, psql) — the server is
 * never left running and no existing cluster is touched. `PG_BIN=/path/to/bin`
 * points at them if they are not on PATH. Postgres refuses to initdb as root,
 * so when run as root the harness drops to the `postgres` system user for the
 * cluster commands.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const PORT = process.env.PG_PORT || '55433'
const DB = 'registry_check'

/* ----------------------------------------------------------------- binaries */

const CANDIDATES = [
  process.env.PG_BIN,
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/16/bin',
  '/usr/lib/postgresql/15/bin',
  '/opt/homebrew/opt/postgresql@16/bin',
  '/usr/local/opt/postgresql@16/bin',
].filter(Boolean)

function findBin() {
  for (const dir of CANDIDATES) {
    if (existsSync(join(dir, 'initdb'))) return dir
  }
  // on PATH?
  const probe = spawnSync('initdb', ['--version'], { stdio: 'ignore' })
  if (probe.status === 0) return null // null = use PATH
  return undefined // undefined = not found at all
}

const BIN = findBin()
if (BIN === undefined) {
  console.error(
    'No Postgres binaries found. Install Postgres (any version 15+) or set\n' +
      'PG_BIN to the directory holding initdb / pg_ctl / psql.\n' +
      '  macOS:  brew install postgresql@16\n' +
      '  Debian: apt-get install postgresql\n' +
      'This harness never touches the hosted project — it needs the binaries only\n' +
      'to stand up a throwaway cluster and delete it again.',
  )
  process.exit(2)
}
const bin = (name) => (BIN ? join(BIN, name) : name)

/* -------------------------------------------------- root, and how to escape it */

/** Postgres refuses to run as root; when we are, borrow an unprivileged user */
const asUser = process.getuid?.() === 0 ? pickUser() : null

function pickUser() {
  for (const name of ['postgres', 'nobody']) {
    const r = spawnSync('id', ['-u', name], { stdio: 'ignore' })
    if (r.status === 0) return name
  }
  console.error(
    'Running as root, and Postgres will not initdb as root. No `postgres` system\n' +
      'user to drop to either. Re-run as an ordinary user.',
  )
  process.exit(2)
}

/** run a cluster command, dropping privileges when we have to */
function pg(cmd, args, opts = {}) {
  if (!asUser) return execFileSync(bin(cmd), args, { stdio: 'pipe', ...opts })
  const quoted = [bin(cmd), ...args].map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ')
  return execFileSync('su', [asUser, '-s', '/bin/sh', '-c', quoted], { stdio: 'pipe', ...opts })
}

/* ------------------------------------------------------------------ cluster */

const dir = mkdtempSync(join(tmpdir(), 'majordomo-registry-'))
const data = join(dir, 'data')
const sock = join(dir, 'sock')
let started = false

function stop() {
  if (started) {
    try {
      pg('pg_ctl', ['-D', data, '-m', 'immediate', 'stop'])
    } catch {
      /* already down */
    }
    started = false
  }
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* nothing to remove */
  }
}
process.on('exit', stop)
process.on('SIGINT', () => process.exit(130))

/** psql against the throwaway cluster, as the superuser */
function psql(args, { db = DB, stop_on_error = true } = {}) {
  const base = ['-h', sock, '-p', PORT, '-U', 'postgres', '-d', db, '-q', '-X']
  if (stop_on_error) base.push('-v', 'ON_ERROR_STOP=1')
  return pg('psql', [...base, ...args], { encoding: 'utf8' }).toString()
}

try {
  execFileSync('mkdir', ['-p', sock])
  if (asUser) execFileSync('chown', ['-R', asUser, dir])

  process.stdout.write('· standing up a throwaway Postgres… ')
  pg('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-sync'])
  pg('pg_ctl', [
    '-D',
    data,
    '-o',
    `-k ${sock} -p ${PORT} -c listen_addresses='' -c fsync=off`,
    '-l',
    join(dir, 'log'),
    '-w',
    'start',
  ])
  started = true
  psql(['-c', `create database ${DB};`], { db: 'postgres' })
  console.log('up')

  process.stdout.write('· the Supabase-shaped fixture… ')
  psql(['-f', join(ROOT, 'supabase/tests/prelude.sql')])
  console.log('ok')

  const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of migrations) {
    process.stdout.write(`· ${f}… `)
    psql(['-f', join(ROOT, 'supabase/migrations', f)])
    console.log('applied')
  }

  /**
   * Re-paste the NEWEST migration, and only that one.
   *
   * "Did my paste land in full?" is answered by pasting the same file again,
   * and that is the retry this repo's ritual actually asks for — so it has to
   * be a no-op. Re-pasting an OLDER file after a newer one is a different
   * operation and is NOT supported: 0006 deliberately replaces things 0004
   * built (`is_share_member` gains its active check, the blanket record policy
   * is dropped, `join_share` grows a column), so running 0004 again would put
   * the loosened versions back. Postgres happens to shout on the last of those
   * three — `cannot change return type of existing function` — which is the
   * only reason it is not silent. Forward only; see supabase/APPLY.md.
   */
  const newest = migrations[migrations.length - 1]
  process.stdout.write(`· ${newest} again (a re-paste must be a no-op)… `)
  psql(['-f', join(ROOT, 'supabase/migrations', newest)])
  console.log('ok')

  console.log('\n── verify.sql: did the schema land in full ──')
  const verified = psql(['-f', join(ROOT, 'supabase/verify.sql')])
  console.log(verified.trimEnd())

  console.log('\n── tests/crew.sql: does the door hold ──')
  const behaved = psql(['-f', join(ROOT, 'supabase/tests/crew.sql')], { stop_on_error: false })
  console.log(behaved.trimEnd())

  const failed = /^\s*>>> FAIL/m.test(verified) || /^\s*>>> FAIL/m.test(behaved)
  if (failed) {
    console.error('\nFAILURES above. Every row is one thing that must be true.')
    process.exit(1)
  }
  console.log('\nThe registry holds.')
} catch (e) {
  const out = [e.stdout, e.stderr].filter(Boolean).map(String).join('\n')
  console.error(`\n${e.message}\n${out}`)
  process.exit(1)
}
