exports.up = (pgm) => {
  // Create revalidate_audit
  pgm.createTable('revalidate_audit', {
    id: { type: 'serial', primaryKey: true },
    user_name: { type: 'text' },
    user_email: { type: 'text' },
    routes: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    results: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  })

  // Create admin_users
  pgm.createTable('admin_users', {
    id: { type: 'serial', primaryKey: true },
    email: { type: 'text', notNull: true },
    name: { type: 'text' },
    mfa_secret: { type: 'text' },
    mfa_enabled: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  })
  pgm.createIndex('admin_users', 'email', { unique: true })

  // Create auth_events
  pgm.createTable('auth_events', {
    id: { type: 'serial', primaryKey: true },
    user_email: { type: 'text' },
    provider: { type: 'text' },
    event: { type: 'text' },
    reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  })
}

exports.down = (pgm) => {
  pgm.dropTable('auth_events')
  pgm.dropTable('admin_users')
  pgm.dropTable('revalidate_audit')
}
