# Revalidate endpoint: revalidate arbitrary routes, rate limiting and IP allowlist

The revalidation endpoint at `/api/revalidate` now supports passing arbitrary routes in the POST body. It remains protected by `REVALIDATE_SECRET` and enforces optional IP allowlisting and rate limiting.

Environment variables (summary):

- REVALIDATE_SECRET (required): secret used to authorize requests
- REVALIDATE_IP_ALLOWLIST (optional): comma-separated list of allowed IP addresses. If set, only requests from these IPs are accepted.
- REVALIDATE_RATE_LIMIT_MAX (optional): max requests per window per IP (default 5)
- REVALIDATE_RATE_LIMIT_WINDOW_SECONDS (optional): window length in seconds (default 60)
- REDIS_URL (optional): if set, the server will use Redis for distributed rate limiting. Otherwise an in-memory per-process limiter is used.
- REVALIDATE_ROUTE_ALLOWLIST (optional): comma-separated list of allowed route paths (exact match). If set, only routes in this allowlist can be revalidated.

Usage examples:

- Revalidate default pages (no JSON body):
  curl -X POST "https://your-domain.com/api/revalidate?secret=YOUR_SECRET"

- Revalidate specific routes (JSON body):
  curl -X POST "https://your-domain.com/api/revalidate?secret=YOUR_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"routes":["/jokes-isr","/some-other-page"]}'

- Or send secret in header (recommended):
  curl -X POST "https://your-domain.com/api/revalidate" -H "x-revalidate-secret: YOUR_SECRET" -H "Content-Type: application/json" -d '{"routes":["/jokes-isr"]}'

Notes:
- The API validates that each route starts with `/` and limits the number of routes to 20 per request.
- If `REVALIDATE_ROUTE_ALLOWLIST` is set, only routes contained in that allowlist can be revalidated (this is recommended for tighter security).
- In multi-instance deployments, set `REDIS_URL` to a shared Redis instance so rate limiting works across instances.
