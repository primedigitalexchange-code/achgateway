# SSO + Audit Logging (Updated)

This project enforces Google hosted-domain checks during sign-in and logs rejected sign-ins to the audit table.

New environment variable to set for Google domain enforcement:

- GOOGLE_HOSTED_DOMAIN=example.com

Behavior:
- If GOOGLE_HOSTED_DOMAIN is set, only Google accounts with an email in that domain will be allowed to sign in.
- Rejected sign-in attempts are recorded in the `auth_events` table with reason `sign_in_rejected`.

Audit tables
- `auth_events` contains rejected sign-ins and reasons. Check `data/admin-audit.db` for entries.

Testing locally:
- Set `GOOGLE_HOSTED_DOMAIN` in `.env.local` and restart the dev server.
- Attempt to sign in with a Google account outside the domain — sign-in will be rejected and logged.

Example `.env.local` additions:

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=some_long_secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_HOSTED_DOMAIN=your-domain.com

Notes:
- If you run multiple instances, set `REDIS_URL` to enable caching for provider membership checks.
- For production, ensure HTTPS and proper provider app configuration for callback URLs.
