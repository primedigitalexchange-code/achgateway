import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { Pool } from 'pg'

async function main() {
  const SQLITE_PATH = process.env.SQLITE_PATH || path.resolve(process.cwd(), './data/admin-audit.db')
  const DATABASE_URL = process.env.DATABASE_URL
  const STRICT = (process.env.STRICT_MIGRATION || '0') === '1' || (process.env.STRICT_MIGRATION || '').toLowerCase() === 'true'
  const OUTPUT_DIR = path.resolve(process.cwd(), 'scripts', 'migration-output')
  const DRY_RUN = (process.env.DRY_RUN || '0') === '1' || (process.env.DRY_RUN || '').toLowerCase() === 'true'

  const REQUIRE_MIGRATE_LOCK = (process.env.REQUIRE_MIGRATE_LOCK || 'false').toLowerCase() === 'true'
  const MIGRATE_LOCK_PATH = process.env.MIGRATE_LOCK_PATH || path.resolve(process.cwd(), './data/MIGRATE_LOCK')
  const MTIME_STABLE_MS = parseInt(process.env.MTIME_STABLE_MS || '2000', 10)

  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Aborting.')
    process.exit(1)
  }
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`SQLite DB not found at ${SQLITE_PATH}. Aborting.`)
    process.exit(1)
  }

  // Safety: maintenance sentinel or mtime stability check
  if (REQUIRE_MIGRATE_LOCK) {
    if (!fs.existsSync(MIGRATE_LOCK_PATH)) {
      console.error(`REQUIRE_MIGRATE_LOCK is enabled but lock file not found at ${MIGRATE_LOCK_PATH}. Create this file to indicate maintenance mode and retry. Aborting.`)
      process.exit(2)
    } else {
      console.log(`Migration lock file present at ${MIGRATE_LOCK_PATH}. Proceeding.`)
    }
  } else {
    // Check mtime stability
    try {
      const stat1 = fs.statSync(SQLITE_PATH)
      const m1 = stat1.mtimeMs
      await wait(MTIME_STABLE_MS)
      const stat2 = fs.statSync(SQLITE_PATH)
      const m2 = stat2.mtimeMs
      if (m1 !== m2) {
        console.error(`SQLite DB mtime changed during stability window (${MTIME_STABLE_MS}ms). It appears the DB is being written to. Either stop the app, create the migrate lock file at ${MIGRATE_LOCK_PATH}, or increase MTIME_STABLE_MS. Aborting.`)
        process.exit(2)
      }
      console.log(`SQLite DB mtime stable for ${MTIME_STABLE_MS}ms — proceeding.`)
    } catch (err) {
      console.warn('Failed to perform mtime stability check:', err?.message)
      // proceed but warn
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  console.log(`Connecting to Postgres (DRY_RUN=${DRY_RUN})...`)
  const pool = new Pool({ connectionString: DATABASE_URL })
  const client = await pool.connect()

  const sqlite = new Database(SQLITE_PATH, { readonly: true })

  const issues: any[] = []
  const summary: any = {
    auth: { found: 0, inserted: 0, wouldInsert: 0, skipped: 0, errors: 0 },
    reval: { found: 0, inserted: 0, wouldInsert: 0, skipped: 0, errors: 0 },
    users: { found: 0, inserted: 0, updated: 0, wouldUpsert: 0, errors: 0 }
  }

  try {
    console.log('Reading SQLite tables...')

    // auth_events
    const authRows = safeAll(sqlite, 'SELECT id, user_email, provider, event, reason, created_at FROM auth_events ORDER BY id ASC')
    summary.auth.found = authRows.length
    console.log(`Found ${authRows.length} auth_events rows`)
    for (const r of authRows) {
      const createdAt = convertCreatedAtOrReport(r.created_at, 'auth_events', r.id, issues)
      if (createdAt === null) {
        summary.auth.errors++
        if (STRICT) return abortWithIssues(issues, OUTPUT_DIR)
        summary.auth.skipped++
        continue
      }
      // idempotency: skip if a matching row exists
      const existsRes = await client.query('SELECT 1 FROM auth_events WHERE user_email = $1 AND provider = $2 AND event = $3 AND reason = $4 AND created_at = $5 LIMIT 1', [r.user_email, r.provider, r.event, r.reason, createdAt])
      if (existsRes.rowCount > 0) {
        summary.auth.skipped++
        continue
      }
      if (DRY_RUN) {
        summary.auth.wouldInsert++
      } else {
        try {
          await client.query('INSERT INTO auth_events (user_email, provider, event, reason, created_at) VALUES ($1,$2,$3,$4,$5)', [r.user_email || null, r.provider || null, r.event || null, r.reason || null, createdAt])
          summary.auth.inserted++
        } catch (err) {
          summary.auth.errors++
          issues.push({ table: 'auth_events', id: r.id, error: String(err?.message), row: r })
          if (STRICT) return abortWithIssues(issues, OUTPUT_DIR)
        }
      }
    }
    console.log(`Auth events: inserted ${summary.auth.inserted} (wouldInsert ${summary.auth.wouldInsert}), skipped ${summary.auth.skipped}, errors ${summary.auth.errors}`)

    // revalidate_audit
    const revalRows = safeAll(sqlite, 'SELECT id, user_name, user_email, routes, results, created_at FROM revalidate_audit ORDER BY id ASC')
    summary.reval.found = revalRows.length
    console.log(`Found ${revalRows.length} revalidate_audit rows`)
    for (const r of revalRows) {
      const createdAt = convertCreatedAtOrReport(r.created_at, 'revalidate_audit', r.id, issues)
      if (createdAt === null) {
        summary.reval.errors++
        if (STRICT) return abortWithIssues(issues, OUTPUT_DIR)
        summary.reval.skipped++
        continue
      }

      // parse routes
      let routesJson: any = null
      try {
        routesJson = normalizeRoutes(r.routes)
      } catch (err) {
        summary.reval.errors++
        issues.push({ table: 'revalidate_audit', id: r.id, column: 'routes', raw: r.routes, error: String(err?.message) })
        if (STRICT) return abortWithIssues(issues, OUTPUT_DIR)
        summary.reval.skipped++
        continue
      }

      // parse results
      let resultsJson: any = null
      try {
        resultsJson = normalizeResults(r.results)
      } catch (err) {
        summary.reval.errors++
        issues.push({ table: 'revalidate_audit', id: r.id, column: 'results', raw: r.results, error: String(err?.message) })
        if (STRICT) return abortWithIssues(issues, OUTPUT_DIR)
        summary.reval.skipped++
        continue
      }

      // idempotency: skip if a matching row exists (same user_email, routes, created_at)
      const routesText = JSON.stringify(routesJson)
      const existsRes = await client.query('SELECT 1 FROM revalidate_audit WHERE user_email = $1 AND routes = $2 AND created_at = $3 LIMIT 1', [r.user_email || null, routesText, createdAt])
      if (existsRes.rowCount > 0) {
        summary.reval.skipped++
        continue
      }

      if (DRY_RUN) {
        summary.reval.wouldInsert++
      } else {
        try {
          await client.query('INSERT INTO revalidate_audit (user_name, user_email, routes, results, created_at) VALUES ($1,$2,$3,$4,$5)', [r.user_name || null, r.user_email || null, routesText, JSON.stringify(resultsJson), createdAt])
          summary.reval.inserted++
        } catch (err) {
          summary.reval.errors++
          issues.push({ table: 'revalidate_audit', id: r.id, error: String(err?.message), row: r })
          if (STRICT) return abortWithIssues(issues, OUTPUT_DIR)
        }
      }
    }
    console.log(`Revalidate audit: inserted ${summary.reval.inserted} (wouldInsert ${summary.reval.wouldInsert}), skipped ${summary.reval.skipped}, errors ${summary.reval.errors}`)

    // admin_users
    const userRows = safeAll(sqlite, 'SELECT id, email, name, mfa_secret, mfa_enabled, created_at FROM admin_users ORDER BY id ASC')
    summary.users.found = userRows.length
    console.log(`Found ${userRows.length} admin_users rows`)
    for (const u of userRows) {
      const createdAt = convertCreatedAtOrReport(u.created_at, 'admin_users', u.id, issues)
      if (createdAt === null) {
        summary.users.errors++
        if (STRICT) return abortWithIssues(issues, OUTPUT_DIR)
        continue
      }

      if (DRY_RUN) {
        // check if would upsert (exists?)
        const existsRes = await client.query('SELECT 1 FROM admin_users WHERE email = $1 LIMIT 1', [u.email || null])
        if (existsRes.rowCount > 0) summary.users.wouldUpsert++
        else summary.users.wouldUpsert++
      } else {
        try {
          await client.query('INSERT INTO admin_users (email, name, mfa_secret, mfa_enabled, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO UPDATE SET mfa_secret = COALESCE(admin_users.mfa_secret, EXCLUDED.mfa_secret), mfa_enabled = admin_users.mfa_enabled OR EXCLUDED.mfa_enabled', [u.email || null, u.name || null, u.mfa_secret || null, !!u.mfa_enabled, createdAt])
          summary.users.inserted++
        } catch (err) {
          summary.users.errors++
          issues.push({ table: 'admin_users', id: u.id, error: String(err?.message), row: u })
          if (STRICT) return abortWithIssues(issues, OUTPUT_DIR)
        }
      }
    }
    console.log(`Admin users: inserted/updated ${summary.users.inserted} (wouldUpsert ${summary.users.wouldUpsert || 0}), errors ${summary.users.errors}`)

    // Write out issues and summary
    const issuesPath = path.join(OUTPUT_DIR, `migration-issues-${Date.now()}.json`)
    fs.writeFileSync(issuesPath, JSON.stringify(issues, null, 2))
    const summaryPath = path.join(OUTPUT_DIR, `migration-summary-${Date.now()}.json`)
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

    console.log('Migration complete.')
    console.log(`Wrote issues to ${issuesPath}`)
    console.log(`Wrote summary to ${summaryPath}`)
    if (DRY_RUN) console.log('DRY_RUN was enabled — no writes were performed.')
  } catch (err) {
    console.error('Migration failed:', err)
    const issuesPath = path.join(OUTPUT_DIR, `migration-issues-${Date.now()}.json`)
    fs.writeFileSync(issuesPath, JSON.stringify(issues, null, 2))
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
    sqlite.close()
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeAll(sqlite: any, sql: string) {
  try {
    return sqlite.prepare(sql).all()
  } catch (err) {
    console.warn('SQLite query failed:', err?.message)
    return []
  }
}

function convertCreatedAtOrReport(val: any, table: string, id: any, issues: any[]) {
  if (val == null) return new Date()
  // If it's a number (seconds)
  if (typeof val === 'number') return new Date(val * 1000)
  const s = String(val).trim()
  if (/^\d+$/.test(s)) return new Date(Number(s) * 1000)
  // Try ISO
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d
  issues.push({ table, id, column: 'created_at', raw: val, error: 'Unrecognized timestamp format' })
  return null
}

function normalizeRoutes(raw: any) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    // If looks like JSON
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
      try { return JSON.parse(s) } catch (e) { throw new Error('Invalid JSON in routes') }
    }
    // If comma-separated
    if (s.includes(',')) return s.split(',').map((r) => r.trim()).filter(Boolean)
    // single route string
    return [s]
  }
  // other types: try to stringify
  try { return JSON.parse(JSON.stringify(raw)) } catch (e) { throw new Error('Unable to normalize routes') }
}

function normalizeResults(raw: any) {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s === '') return null
    try { return JSON.parse(s) } catch (e) {
      // Not JSON — return as string wrapper
      return { raw: s }
    }
  }
  return { raw: String(raw) }
}

function abortWithIssues(issues: any[], OUTPUT_DIR: string) {
  const issuesPath = path.join(OUTPUT_DIR, `migration-issues-abort-${Date.now()}.json`)
  fs.writeFileSync(issuesPath, JSON.stringify(issues, null, 2))
  console.error(`Aborting due to issues. See ${issuesPath}`)
  process.exit(2)
}

main().catch((err) => { console.error(err); process.exit(1) })
