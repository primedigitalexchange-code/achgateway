import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_DIR = process.env.DB_DIR || path.resolve(process.cwd(), './data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
const DB_PATH = path.join(DB_DIR, 'admin-audit.db')

const db = new Database(DB_PATH)

// Initialize table
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
