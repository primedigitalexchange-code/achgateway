## Using Redis for distributed rate limiting & caching

For multi-instance deployments, set `REDIS_URL` so that:

- The revalidate rate limiter is shared across instances (prevents bypassing limits).
- Provider membership checks (GitHub/org, GitHub/team) use a shared cache and avoid excessive provider API calls.

Example Redis URL (do not commit this value):

REDIS_URL=redis://:password@redis.example.com:6379/0

If you don't set `REDIS_URL`, the app will fall back to an in-memory cache and per-process rate limits which are insufficient for multi-instance deployments.
