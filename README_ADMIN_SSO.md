---
title: Admin SSO & Audit (Redis, Postgres, Alerts)
---

Updates made:

- Replaced SQLite-based audit store with Postgres using DATABASE_URL.
- Added DB initialization (tables created if missing) via lib/db.ts.
- Added alerting (SendGrid + Slack webhook) for repeated auth rejections and repeated revalidation failures.
- Added CSV export endpoints for auth events and revalidation audits.
- Added retention endpoint to delete old audit rows (retention window configurable).
- Added admin UI pages for logs and export (see /admin/logs/*).

Environment variables (new/updated)

- DATABASE_URL=postgres://user:pass@host:5432/dbname  # required for Postgres audit store
- REDIS_URL=redis://...    # optional but recommended for caching in multi-instance deployments
- SENDGRID_API_KEY=...     # optional, for email alerts
- ALERT_EMAIL_TO=...       # email recipient for alerts
- ALERT_EMAIL_FROM=...     # email sender for alerts (must be a verified sender in SendGrid)
- SLACK_WEBHOOK_URL=...    # optional, Slack webhook to post alerts
- ALERT_AUTH_THRESHOLD=5   # number of sign-in rejections in window to trigger alert (default 5)
- ALERT_REVALIDATE_FAILURE_THRESHOLD=3 # threshold for revalidation failures (default 3)
- ALERT_WINDOW_MINUTES=5   # sliding window in minutes to evaluate thresholds
- ALERT_COOLDOWN_SECONDS=600 # cooldown between alerts of the same kind (default 600)
- AUDIT_RETENTION_DAYS=90  # default retention days for manual deletion

Notes:
- Do NOT commit DATABASE_URL, SENDGRID_API_KEY, SLACK_WEBHOOK_URL, or any secrets. Set them securely in your platform.
- For production, run Postgres and set DATABASE_URL; the app will create tables automatically on startup.
- Redis (REDIS_URL) is recommended for multi-instance caching of provider membership checks and shared rate-limiting.

Testing:
- After setting DATABASE_URL and restarting, audit tables will be available in Postgres.
- Trigger repeated rejected sign-ins or failed revalidations to see alerts (if alerting configured).
- Use the new export endpoints to download CSVs.
- Run retention by POSTing to /api/admin/logs/retention with { days: 90 } in the body.
