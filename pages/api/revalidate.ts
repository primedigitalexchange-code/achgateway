import type { NextApiRequest, NextApiResponse } from 'next'
import Redis from 'ioredis'

// Protected revalidate endpoint with optional IP allowlist and rate limiting.
// Environment variables:
// - REVALIDATE_SECRET: required secret to authorize revalidation calls
// - REVALIDATE_IP_ALLOWLIST: optional comma-separated list of allowed IPs (exact match)
// - REVALIDATE_RATE_LIMIT_MAX: max requests per window per IP (default 5)
// - REVALIDATE_RATE_LIMIT_WINDOW_SECONDS: window length in seconds (default 60)
// - REDIS_URL: optional Redis URL for distributed rate limiting

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

// In-memory fallback rate limiter (per-process)
type RateInfo = { count: number; expiresAt: number }
const memRate = new Map<string, RateInfo>()

function getClientIp(req: NextApiRequest): string {
  // Standard X-Forwarded-For header may contain a comma-separated list; the left-most is the client
  const xfwd = req.headers['x-forwarded-for'] as string | undefined
  if (xfwd) {
    return xfwd.split(',')[0].trim()
  }

  // Cloudflare / proxy may use CF-Connecting-IP
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
      // fall through to in-memory
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

  try {
    // Revalidate the ISR page(s) immediately
    await res.revalidate('/jokes-isr')
    // Optionally revalidate SSR page to refresh cache; harmless if page is SSR but kept for symmetry
    try {
      await res.revalidate('/jokes-ssr')
    } catch (e) {
      // Some hosts may error revalidating SSR pages; ignore
    }
    return res.json({ revalidated: true })
  } catch (err: any) {
    console.error('Revalidation error', err)
    return res.status(500).json({ message: 'Error revalidating', error: err?.message })
  }
}
