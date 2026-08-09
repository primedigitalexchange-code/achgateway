import { pool } from './db'
import { sendAlertIfNeeded } from './alerts'

// Audit helpers using Postgres

export async function logRevalidation(userName: string | null, userEmail: string | null, routes: string[], results: any) {
  if (!pool) return
  const client = await pool.connect()
  try {
    await client.query(
      'INSERT INTO revalidate_audit (user_name, user_email, routes, results) VALUES ($1, $2, $3, $4)',
      [userName || null, userEmail || null, JSON.stringify(routes), JSON.stringify(results)]
    )

    // Check for repeated failures and alert
    // Count failures in last N minutes
    const windowMin = parseInt(process.env.ALERT_WINDOW_MINUTES || '5', 10)
    const threshold = parseInt(process.env.ALERT_REVALIDATE_FAILURE_THRESHOLD || '3', 10)
    const res = await client.query('SELECT COUNT(*) FROM revalidate_audit WHERE (results->>\'ok\') = \'' + 'false' + '\' AND created_at > now() - INTERVAL $1 MINUTE', [windowMin])
    const count = parseInt(res.rows[0].count, 10)
    if (count >= threshold) {
      await sendAlertIfNeeded('revalidate_failures', {
        count,
        windowMin,
        recent: results,
      })
    }
  } catch (err) {
    console.warn('Failed to write revalidation audit to Postgres', (err as any)?.message)
  } finally {
    client.release()
  }
}

export async function getRevalidationLogs(limit = 50, offset = 0) {
  if (!pool) return []
  const client = await pool.connect()
  try {
    const res = await client.query('SELECT id, user_name, user_email, routes, results, EXTRACT(EPOCH FROM created_at) AS created_at FROM revalidate_audit ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset])
    return res.rows.map((r) => ({ ...r, routes: JSON.stringify(r.routes), results: JSON.stringify(r.results) }))
  } finally {
    client.release()
  }
}

export async function ensureUser(email: string, name?: string) {
  if (!pool) return
  const client = await pool.connect()
  try {
    await client.query('INSERT INTO admin_users (email, name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [email, name || null])
  } catch (err) {
    console.warn('Failed to ensure user in Postgres', (err as any)?.message)
  } finally {
    client.release()
  }
}

export async function setMfaSecret(email: string, secret: string) {
  if (!pool) return
  const client = await pool.connect()
  try {
    await client.query('UPDATE admin_users SET mfa_secret = $1, mfa_enabled = false WHERE email = $2', [secret, email])
  } catch (err) {
    console.warn('Failed to set mfa secret', (err as any)?.message)
  } finally {
    client.release()
  }
}

export async function enableMfa(email: string) {
  if (!pool) return
  const client = await pool.connect()
  try {
    await client.query('UPDATE admin_users SET mfa_enabled = true WHERE email = $1', [email])
  } catch (err) {
    console.warn('Failed to enable mfa', (err as any)?.message)
  } finally {
    client.release()
  }
}

export async function getMfaForUser(email: string) {
  if (!pool) return null
  const client = await pool.connect()
  try {
    const res = await client.query('SELECT mfa_secret, mfa_enabled FROM admin_users WHERE email = $1', [email])
    return res.rows[0] || null
  } finally {
    client.release()
  }
}

export async function logAuthEvent(userEmail: string | null, provider: string, reason: string) {
  if (!pool) return
  const client = await pool.connect()
  try {
    await client.query('INSERT INTO auth_events (user_email, provider, event, reason) VALUES ($1, $2, $3, $4)', [userEmail || null, provider, 'sign_in_rejected', reason])

    // Alerting: repeated rejected sign-ins
    const windowMin = parseInt(process.env.ALERT_WINDOW_MINUTES || '5', 10)
    const threshold = parseInt(process.env.ALERT_AUTH_THRESHOLD || '5', 10)
    const res = await client.query('SELECT COUNT(*) FROM auth_events WHERE created_at > now() - INTERVAL $1 MINUTE', [windowMin])
    const count = parseInt(res.rows[0].count, 10)
    if (count >= threshold) {
      await sendAlertIfNeeded('auth_rejections', { count, windowMin, recentReason: reason, userEmail })
    }
  } catch (err) {
    console.warn('Failed to write auth event to Postgres', (err as any)?.message)
  } finally {
    client.release()
  }
}

export async function getAuthEvents(limit = 50, offset = 0) {
  if (!pool) return []
  const client = await pool.connect()
  try {
    const res = await client.query('SELECT id, user_email, provider, event, reason, EXTRACT(EPOCH FROM created_at) AS created_at FROM auth_events ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset])
    return res.rows
  } finally {
    client.release()
  }
}

export async function exportAuthEventsCsv(limit = 1000) {
  const client = await pool.connect()
  try {
    const res = await client.query('SELECT id, user_email, provider, event, reason, to_char(created_at,\'YYYY-MM-DD HH24:MI:SS TZ\') as created_at FROM auth_events ORDER BY id DESC LIMIT $1', [limit])
    const rows = res.rows
    const header = ['id', 'user_email', 'provider', 'event', 'reason', 'created_at']
    const csv = [header.join(',')].concat(rows.map(r => `${r.id},"${(r.user_email||'').replace(/"/g,'""')}",${r.provider},${r.event},"${(r.reason||'').replace(/"/g,'""')}","${r.created_at}"`)).join('\n')
    return csv
  } finally {
    client.release()
  }
}

export async function exportRevalidationCsv(limit = 1000) {
  const client = await pool.connect()
  try {
    const res = await client.query("SELECT id, user_name, user_email, routes::text AS routes, results::text AS results, to_char(created_at,'YYYY-MM-DD HH24:MI:SS TZ') as created_at FROM revalidate_audit ORDER BY id DESC LIMIT $1", [limit])
    const rows = res.rows
    const header = ['id', 'user_name', 'user_email', 'routes', 'results', 'created_at']
    const csv = [header.join(',')].concat(rows.map(r => `${r.id},"${(r.user_name||'').replace(/"/g,'""')}","${(r.user_email||'').replace(/"/g,'""')},","${(r.routes||'').replace(/"/g,'""')}","${(r.results||'').replace(/"/g,'""')}","${r.created_at}"`)).join('\n')
    return csv
  } finally {
    client.release()
  }
}

export async function runRetention(retentionDays = 90) {
  if (!pool) return { deletedAuth: 0, deletedRevalidation: 0 }
  const client = await pool.connect()
  try {
    const authRes = await client.query('DELETE FROM auth_events WHERE created_at < now() - INTERVAL $1 DAY RETURNING id', [retentionDays])
    const revalRes = await client.query('DELETE FROM revalidate_audit WHERE created_at < now() - INTERVAL $1 DAY RETURNING id', [retentionDays])
    return { deletedAuth: authRes.rowCount, deletedRevalidation: revalRes.rowCount }
  } finally {
    client.release()
  }
}
