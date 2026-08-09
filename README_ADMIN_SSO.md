## Redis caching for provider membership checks

If you run multiple instances of this app, it's strongly recommended to set `REDIS_URL` so provider membership checks (GitHub org/team, etc.) use a shared cache and avoid hitting provider rate limits.

Set REDIS_URL in your environment (example):

- For Redis with a password:
  REDIS_URL=redis://:password@redis-host:6379/0

- For Redis without a password:
  REDIS_URL=redis://redis-host:6379/0

Behavior:
- When `REDIS_URL` is set, the provider-checks use Redis to cache boolean membership results for a short TTL (default 300s).
- When not set, an in-memory per-process cache is used (suitable for single-instance testing only).

Note: Do NOT commit secrets (like REDIS_URL) to source control; set them in your hosting platform's secure environment variables.
