import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL || ''
if (!DATABASE_URL) {
  console.warn('DATABASE_URL not set — falling back to no DB. Audit/logging features disabled.')
}

export const pool = new Pool({ connectionString: DATABASE_URL || undefined })

export async function ensureTables() {
  if (!DATABASE_URL) return
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS revalidate_audit (
        id SERIAL PRIMARY KEY,
        user_name TEXT,
        user_email TEXT,
        routes JSONB,
        results JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        mfa_secret TEXT,
        mfa_enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS auth_events (
        id SERIAL PRIMARY KEY,
        user_email TEXT,
        provider TEXT,
        event TEXT,
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `)
  } finally {
    client.release()
  }
}

// run ensureTables at import time (best-effort)
ensureTables().catch((err) => {
  console.warn('Failed to ensure DB tables:', err?.message)
})
