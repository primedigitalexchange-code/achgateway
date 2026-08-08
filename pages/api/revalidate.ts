import type { NextApiRequest, NextApiResponse } from 'next'
import Redis from 'ioredis'

// Protected revalidate endpoint with optional IP allowlist, rate limiting, and now
// optional revalidation of arbitrary routes passed in the POST body (still protected).
// Environment variables:
// - REVALIDATE_SECRET: required secret to authorize revalidation calls
// - REVALIDATE_IP_ALLOWLIST: optional comma-separated list of allowed IPs (exact match)
// - REVALIDATE_RATE_LIMIT_MAX: max requests per window per IP (default 5)
// - REVALIDATE_RATE_LIMIT_WINDOW_SECONDS: window length in seconds (default 60)
// - REDIS_URL: optional Redis URL for distributed rate limiting
// - REVALIDATE_ROUTE_ALLOWLIST: optional comma-separated list of allowed routes (exact match); if set, only these routes can be revalidated

const redisUrl = process.env.REDIS_URL || ''
let redis: Redis | null = null
if (redisUrl) {
  try {
    redis = new Redis(redisUrl)
  } catch (err) {
    console.warn('Failed to initialize Redis client for revalidate rate limiter:', (err as any)?.message)
    redis = null
  }
}

const RATE_LIMIT_MAX = parseInt(process.env.REVALIDATE_RATE_LIMIT_MAX || '5', 10)
const RATE_LIMIT_WINDOW = parseInt(process.env.REVALIDATE_RATE_LIMIT_WINDOW_SECONDS || '60', 10)
const IP_ALLOWLIST = (process.env.REVALIDATE_IP_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean)
const ROUTE_ALLOWLIST = (process.env.REVALIDATE_ROUTE_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean)

// In-memory fallback rate limiter (per-process)
type RateInfo = { count: number; expiresAt: number }
const memRate = new Map<string, RateInfo>()

function getClientIp(req: NextApiRequest): string {
  const xfwd = req.headers['x-forwarded-for'] as string | undefined
  if (xfwd) {
    return xfwd.split(',')[0].trim()
  }
  const cf = req.headers['cf-connecting-ip'] as string | undefined
  if (cf) return cf
  const sock = req.socket.remoteAddress
  return sock || 'unknown'
}

async function incrementRate(ip: string): Promise<number> {
  if (redis) {
    try {
      const key = `revalidate:rate:${ip}`
      const val = await redis.incr(key)
      if (val === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW)
      }
      return val
    } catch (err) {
      console.warn('Redis rate increment failed, falling back to memory limiter', (err as any)?.message)
    }
  }

  const now = Date.now()
  const existing = memRate.get(ip)
  if (!existing || existing.expiresAt <= now) {
    memRate.set(ip, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW * 1000 })
    return 1
  }
  existing.count += 1
  memRate.set(ip, existing)
  return existing.count
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed. Use POST.' })
  }

  const secretFromQuery = Array.isArray(req.query.secret) ? req.query.secret[0] : req.query.secret
  const secretFromHeader = req.headers['x-revalidate-secret'] as string | undefined
  const secret = (secretFromQuery || secretFromHeader) as string | undefined

  if (!process.env.REVALIDATE_SECRET) {
    return res.status(500).json({ message: 'REVALIDATE_SECRET is not configured on the server' })
  }

  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return res.status(401).json({ message: 'Invalid secret' })
  }

  const ip = getClientIp(req)

  // IP allowlist check (if configured)
  if (IP_ALLOWLIST.length > 0 && !IP_ALLOWLIST.includes(ip)) {
    return res.status(403).json({ message: `IP not allowed: ${ip}` })
  }

  // Rate limiting
  try {
    const count = await incrementRate(ip)
    if (count > RATE_LIMIT_MAX) {
      return res.status(429).json({ message: 'Rate limit exceeded' })
    }
  } catch (err) {
    console.warn('Rate limiting encountered an error, allowing request by default', (err as any)?.message)
  }

  // Determine routes to revalidate. Default list if none provided
  let routes: string[] = ['/jokes-isr', '/jokes-ssr']
  try {
    if (req.body) {
      // Accept JSON body with { routes: ["/path1", "/path2"] }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      if (body && Array.isArray(body.routes)) {
        routes = body.routes.map(String)
      }
    }
  } catch (err) {
    return res.status(400).json({ message: 'Invalid JSON body' })
  }

  // Validate routes: simple safety checks
  if (!Array.isArray(routes) || routes.length === 0) {
    return res.status(400).json({ message: 'No routes provided to revalidate' })
  }
  if (routes.length > 20) {
    return res.status(400).json({ message: 'Too many routes; max 20' })
  }

  for (const r of routes) {
    if (typeof r !== 'string' || !r.startsWith('/')) {
      return res.status(400).json({ message: `Invalid route: ${String(r)}` })
    }
  }

  // If a route allowlist is configured, ensure all requested routes are allowed
  if (ROUTE_ALLOWLIST.length > 0) {
    const blocked = routes.filter((r) => !ROUTE_ALLOWLIST.includes(r))
    if (blocked.length > 0) {
      return res.status(403).json({ message: 'Some routes are not allowed', blocked })
    }
  }

  // Revalidate each route
  const results: Record<string, { ok: boolean; error?: string }> = {}
  for (const route of routes) {
    try {
      await res.revalidate(route)
      results[route] = { ok: true }
    } catch (err: any) {
      // Record failure but continue
      results[route] = { ok: false, error: err?.message }
    }
  }

  return res.json({ revalidated: true, results })
}
