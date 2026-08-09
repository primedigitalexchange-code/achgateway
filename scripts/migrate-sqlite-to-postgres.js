import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { Pool } from 'pg'

async function main() {
  const SQLITE_PATH = process.env.SQLITE_PATH || path.resolve(process.cwd(), './data/admin-audit.db')
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Aborting.')
    process.exit(1)
  }
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`SQLite DB not found at ${SQLITE_PATH}. Aborting.`)
    process.exit(1)
  }

  console.log('Connecting to Postgres...')
  const pool = new Pool({ connectionString: DATABASE_URL })
  const client = await pool.connect()

  const sqlite = new Database(SQLITE_PATH, { readonly: true })
  try {
    console.log('Reading SQLite tables...')

    // auth_events
    const authRows = sqlite.prepare('SELECT id, user_email, provider, event, reason, created_at FROM auth_events ORDER BY id ASC').all()
    console.log(`Found ${authRows.length} auth_events rows`)
    let authInserted = 0
    for (const r of authRows) {
      const createdAt = convertCreatedAt(r.created_at)
      // idempotency: skip if a matching row exists
      const existsRes = await client.query('SELECT 1 FROM auth_events WHERE user_email = $1 AND provider = $2 AND event = $3 AND reason = $4 AND created_at = $5 LIMIT 1', [r.user_email, r.provider, r.event, r.reason, createdAt])
      if (existsRes.rowCount > 0) continue
      await client.query('INSERT INTO auth_events (user_email, provider, event, reason, created_at) VALUES ($1,$2,$3,$4,$5)', [r.user_email || null, r.provider || null, r.event || null, r.reason || null, createdAt])
      authInserted++
    }
    console.log(`Inserted ${authInserted} new auth_events rows`)

    // revalidate_audit
    const revalRows = sqlite.prepare('SELECT id, user_name, user_email, routes, results, created_at FROM revalidate_audit ORDER BY id ASC').all()
    console.log(`Found ${revalRows.length} revalidate_audit rows`)
    let revalInserted = 0
    for (const r of revalRows) {
      const createdAt = convertCreatedAt(r.created_at)
      let routesJson = []
      try { routesJson = typeof r.routes === 'string' ? JSON.parse(r.routes) : r.routes } catch (e) { routesJson = [String(r.routes)] }
      let resultsJson = null
      try { resultsJson = typeof r.results === 'string' ? JSON.parse(r.results) : r.results } catch (e) { resultsJson = r.results }

      // idempotency: skip if a matching row exists (same user_email, routes, created_at)
      const existsRes = await client.query('SELECT 1 FROM revalidate_audit WHERE user_email = $1 AND routes = $2 AND created_at = $3 LIMIT 1', [r.user_email || null, JSON.stringify(routesJson), createdAt])
      if (existsRes.rowCount > 0) continue

      await client.query('INSERT INTO revalidate_audit (user_name, user_email, routes, results, created_at) VALUES ($1,$2,$3,$4,$5)', [r.user_name || null, r.user_email || null, JSON.stringify(routesJson), JSON.stringify(resultsJson), createdAt])
      revalInserted++
    }
    console.log(`Inserted ${revalInserted} new revalidate_audit rows`)

    // admin_users
    const userRows = sqlite.prepare('SELECT id, email, name, mfa_secret, mfa_enabled, created_at FROM admin_users ORDER BY id ASC').all()
    console.log(`Found ${userRows.length} admin_users rows`)
    let usersInserted = 0
    for (const u of userRows) {
      const createdAt = convertCreatedAt(u.created_at)
      // upsert user (preserve existing)
      await client.query('INSERT INTO admin_users (email, name, mfa_secret, mfa_enabled, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO UPDATE SET mfa_secret = COALESCE(admin_users.mfa_secret, EXCLUDED.mfa_secret), mfa_enabled = admin_users.mfa_enabled OR EXCLUDED.mfa_enabled', [u.email || null, u.name || null, u.mfa_secret || null, !!u.mfa_enabled, createdAt])
      usersInserted++
    }
    console.log(`Imported/updated ${usersInserted} admin_users rows`)

    console.log('Migration complete.')
  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    client.release()
    await pool.end()
    sqlite.close()
  }
}

function convertCreatedAt(val) {
  // SQLite stored created_at as INTEGER (seconds) in earlier code; could also be TEXT ISO string
  if (val == null) return new Date()
  if (typeof val === 'number') return new Date(val * 1000)
  if (/^\d+$/.test(String(val))) return new Date(Number(val) * 1000)
  // otherwise assume ISO string
  const d = new Date(val)
  if (!isNaN(d.getTime())) return d
  return new Date()
}

main().catch((err) => { console.error(err); process.exit(1) })
