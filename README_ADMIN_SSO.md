# SSO + Audit Logging

This change replaces the previous password cookie admin auth with OAuth-based SSO using NextAuth, and adds persistent audit logs for admin revalidation actions using SQLite (better-sqlite3).

New environment variables to set

- NEXTAUTH_URL (required for NextAuth; e.g., https://your-domain.com)
- NEXTAUTH_SECRET (required; set a long secret)
- GITHUB_ID / GITHUB_SECRET (for GitHub provider) — optional
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (for Google provider) — optional
- ADMIN_PASSWORD is no longer required for the admin UI.
- DB_DIR (optional) — directory to store SQLite DB files (defaults to ./data)

How it works

- Sign in via /api/auth (NextAuth) using GitHub or Google providers (buttons on /admin will redirect to NextAuth sign-in flows).
- The admin UI uses the NextAuth session (useSession) and calls /api/admin/revalidate.
- /api/admin/revalidate runs server-side, calls the internal revalidate endpoint using server-side secrets (serverRevalidate), and writes an audit entry with the user name/email, routes, results, and timestamp into data/admin-audit.db.

Where logs are stored

- SQLite DB at: ./data/admin-audit.db (create the directory if it doesn't exist). Use DB_DIR env var to change path.
- Table: revalidate_audit

Security notes

- Keep NEXTAUTH_SECRET and provider secrets safe. Do NOT commit them to source control.
- For production, prefer enabling both GITHUB and Google providers and use an allowlist for emails or GitHub orgs if you want to restrict admin access further.
- Continue to use REVALIDATE_ROUTE_ALLOWLIST and IP allowlists on the revalidate endpoint for tighter control.

Next steps (optional)

- Add UI to view recent audit logs in the admin page.
- Add role-based checks (e.g., only certain emails allowed). I can add an EMAIL_ALLOWLIST env var and enforce it in /api/admin/revalidate if you'd like.
