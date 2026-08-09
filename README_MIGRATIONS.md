# Database migrations

This project now uses node-pg-migrate to manage Postgres schema migrations.

How to run migrations

1. Install dependencies (if not already):
   npm install

2. Ensure DATABASE_URL is set in your environment. Example:
   export DATABASE_URL=postgres://user:password@host:5432/dbname

3. Run migrations up:
   npm run migrate

4. To roll back the latest migration:
   npm run migrate:down

Notes
- node-pg-migrate will read DATABASE_URL from the environment. Do not commit your connection string to source control.
- After running migrations, the audit tables (revalidate_audit, admin_users, auth_events) will be created.

If you prefer another migration tool (Prisma, Flyway, etc.) I can provide a schema or migration scripts for that tooling as well.
