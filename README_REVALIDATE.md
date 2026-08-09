## Revalidate / Redis / Postgres notes

This project now supports Postgres for audit logs and Redis for caching/rate-limiting.

Environment notes:
- DATABASE_URL must be set to store audit logs in Postgres. Without it, audit functions become no-ops and warnings are logged.
- REDIS_URL enables distributed caching and should be set in production for multi-instance deployments.

CSV export and retention endpoints:
- GET /api/admin/logs/export/auth?limit=1000 -> downloads CSV of recent auth events
- GET /api/admin/logs/export/revalidations?limit=1000 -> downloads CSV of recent revalidations
- POST /api/admin/logs/retention { days: 90 } -> deletes audit rows older than given days

Alerting:
- Configure SENDGRID_API_KEY and ALERT_EMAIL_FROM/ALERT_EMAIL_TO to receive email alerts.
- Configure SLACK_WEBHOOK_URL to receive Slack alerts.

