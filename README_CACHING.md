---
## Caching & ISR configuration

This project includes an in-memory cache and optional Redis-backed cache for jokes used by the ISR page.

Environment variables:

- JOKE_REVALIDATE_SECONDS (used by ISR revalidate interval) — defaults to 60
- JOKE_CACHE_TTL_SECONDS (optional, defaults to JOKE_REVALIDATE_SECONDS) — how long the joke stays in cache
- REDIS_URL (optional) — if set, the server will attempt to use Redis for shared caching across instances

Behavior:
- The ISR page (`/jokes-isr`) calls the server helper `lib/joke.ts` which first checks an in-memory cache, then Redis (if configured), and finally fetches from upstream joke APIs with retry/backoff.
- Use Redis in production (set `REDIS_URL`) so all server instances share the same joke cache and reduce upstream request volume.

Example `.env.local` additions:

JOKE_REVALIDATE_SECONDS=120
JOKE_CACHE_TTL_SECONDS=120
REDIS_URL=redis://:<password>@hostname:6379/0

---
