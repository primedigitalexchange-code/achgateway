# Revalidate endpoint: rate limiting and IP allowlist

The revalidation endpoint at `/api/revalidate` now supports optional IP allowlisting and rate limiting.

Environment variables:

- REVALIDATE_SECRET (required): secret used to authorize requests
- REVALIDATE_IP_ALLOWLIST (optional): comma-separated list of allowed IP addresses. If set, only requests from these IPs are accepted.
- REVALIDATE_RATE_LIMIT_MAX (optional): max requests per window per IP (default 5)
- REVALIDATE_RATE_LIMIT_WINDOW_SECONDS (optional): window length in seconds (default 60)
- REDIS_URL (optional): if set, the server will use Redis for distributed rate limiting. Otherwise an in-memory per-process limiter is used.

Usage examples:

- Call with secret in query string:
  curl -X POST "https://your-domain.com/api/revalidate?secret=YOUR_SECRET"

- Call with header (recommended):
  curl -X POST "https://your-domain.com/api/revalidate" -H "x-revalidate-secret: YOUR_SECRET"

Notes:
- In multi-instance deployments, set REDIS_URL to a shared Redis instance so rate limiting works across instances.
- IP allowlist supports exact IP matches. If you sit behind a proxy, ensure the proxy forwards the original client IP in `x-forwarded-for`.
