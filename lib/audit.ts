import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_DIR = process.env.DB_DIR || path.resolve(process.cwd(), './data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
const DB_PATH = path.join(DB_DIR, 'admin-audit.db')

const db = new Database(DB_PATH)

// Initialize tables
db.prepare(`
  CREATE TABLE IF NOT EXISTS revalidate_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT,
    user_email TEXT,
    routes TEXT,
    results TEXT,
    created_at INTEGER
  )
`).run()

db.prepare(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    name TEXT,
    mfa_secret TEXT,
    mfa_enabled INTEGER DEFAULT 0,
    created_at INTEGER
  )
`).run()

export function logRevalidation(userName: string | null, userEmail: string | null, routes: string[], results: any) {
  try {
    const stmt = db.prepare('INSERT INTO revalidate_audit (user_name, user_email, routes, results, created_at) VALUES (?, ?, ?, ?, ?)')
    stmt.run(userName || null, userEmail || null, JSON.stringify(routes), JSON.stringify(results), Math.floor(Date.now() / 1000))
  } catch (err) {
    console.warn('Failed to write audit log', (err as any)?.message)
  }
}

export function getRecentLogs(limit = 50) {
  const stmt = db.prepare('SELECT * FROM revalidate_audit ORDER BY id DESC LIMIT ?')
  return stmt.all(limit)
}

export function ensureUser(email: string, name?: string) {
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO admin_users (email, name, created_at) VALUES (?, ?, ?)')
    stmt.run(email, name || null, Math.floor(Date.now() / 1000))
  } catch (err) {
    console.warn('Failed to ensure user', (err as any)?.message)
  }
}

export function setMfaSecret(email: string, secret: string) {
  try {
    const stmt = db.prepare('UPDATE admin_users SET mfa_secret = ?, mfa_enabled = 0 WHERE email = ?')
    stmt.run(secret, email)
  } catch (err) {
    console.warn('Failed to set mfa secret', (err as any)?.message)
  }
}

export function enableMfa(email: string) {
  try {
    const stmt = db.prepare('UPDATE admin_users SET mfa_enabled = 1 WHERE email = ?')
    stmt.run(email)
  } catch (err) {
    console.warn('Failed to enable mfa', (err as any)?.message)
  }
}

export function getMfaForUser(email: string) {
  try {
    const stmt = db.prepare('SELECT mfa_secret, mfa_enabled FROM admin_users WHERE email = ?')
    return stmt.get(email)
  } catch (err) {
    console.warn('Failed to get mfa for user', (err as any)?.message)
    return null
  }
}
