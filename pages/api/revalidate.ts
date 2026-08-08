import type { NextApiRequest, NextApiResponse } from 'next'
import Redis from 'ioredis'
import getRawBody from 'raw-body'
import crypto from 'crypto'

// Protected revalidate endpoint with optional IP allowlist, rate limiting, HMAC validation,
// and automatic retries/backoff for failed route revalidations.
// Environment variables (new/updated):
// - REVALIDATE_SECRET: required secret to authorize revalidation calls
// - REVALIDATE_HMAC_SECRET: optional HMAC key; if set, requests must include a valid HMAC signature
// - REVALIDATE_HMAC_TOLERANCE_SECONDS: allowed timestamp drift for HMAC (default 300)
// - REVALIDATE_IP_ALLOWLIST: optional comma-separated list of allowed IPs (exact match)
// - REVALIDATE_RATE_LIMIT_MAX: max requests per window per IP (default 5)
// - REVALIDATE_RATE_LIMIT_WINDOW_SECONDS: window length in seconds (default 60)
// - REDIS_URL: optional Redis URL for distributed rate limiting
// - REVALIDATE_ROUTE_ALLOWLIST: optional comma-separated list of allowed routes (exact match)
// - REVALIDATE_ROUTE_RETRIES: number of retries for failing route revalidations (default 3)
// - REVALIDATE_ROUTE_RETRY_BASE_MS: base delay in ms for exponential backoff (default 200)

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
const ROUTE_RETRIES = parseInt(process.env.REVALIDATE_ROUTE_RETRIES || '3', 10)
const ROUTE_RETRY_BASE_MS = parseInt(process.env.REVALIDATE_ROUTE_RETRY_BASE_MS || '200', 10)
const HMAC_SECRET = process.env.REVALIDATE_HMAC_SECRET || ''
const HMAC_TOLERANCE_SECONDS = parseInt(process.env.REVALIDATE_HMAC_TOLERANCE_SECONDS || '300', 10)

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

// Read raw body so we can validate HMAC signatures reliably
export const config = { api: { bodyParser: false } }

function computeHmac(secret: string, timestamp: string, bodyStr: string) {
  const h = crypto.createHmac('sha256', secret)
  h.update(`${timestamp}.${bodyStr}`)
  return h.digest('hex')
}

function timingSafeEqualHex(a: string, b: string) {
  try {
    const ab = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ab.length !== bb.length) return false
    return crypto.timingSafeEqual(ab, bb)
  } catch (e) {
    return false
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed. Use POST.' })
  }

  // Read raw body
  let rawBody = ''
  try {
    const buf = await getRawBody(req)
    rawBody = buf.toString()
  } catch (err) {
    console.warn('Failed to read raw body', (err as any)?.message)
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

  // If HMAC secret is configured, validate signature
  if (HMAC_SECRET) {
    const sig = req.headers['x-revalidate-signature'] as string | undefined
    const ts = req.headers['x-revalidate-timestamp'] as string | undefined
    if (!sig || !ts) {
      return res.status(401).json({ message: 'Missing HMAC signature or timestamp headers' })
    }

    const now = Math.floor(Date.now() / 1000)
    const tnum = parseInt(ts, 10)
    if (isNaN(tnum) || Math.abs(now - tnum) > HMAC_TOLERANCE_SECONDS) {
      return res.status(401).json({ message: 'HMAC timestamp outside tolerance' })
    }

    const expected = computeHmac(HMAC_SECRET, ts, rawBody)
    if (!timingSafeEqualHex(expected, sig)) {
      return res.status(401).json({ message: 'Invalid HMAC signature' })
    }
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
    if (rawBody) {
      const body = rawBody ? JSON.parse(rawBody) : {}
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

  // Revalidate each route with retries/backoff
  const results: Record<string, { ok: boolean; attempts: number; error?: string }> = {}
  for (const route of routes) {
    let attempt = 0
    let ok = false
    let lastErr: any = null
    while (attempt < ROUTE_RETRIES) {
      attempt += 1
      try {
        await res.revalidate(route)
        ok = true
        results[route] = { ok: true, attempts: attempt }
        break
      } catch (err: any) {
        lastErr = err
        const delay = ROUTE_RETRY_BASE_MS * Math.pow(2, attempt - 1)
        console.warn(`Revalidate attempt ${attempt} failed for ${route}: ${err?.message}; retrying in ${delay}ms`)
        await sleep(delay)
      }
    }

    if (!ok) {
      results[route] = { ok: false, attempts: attempt, error: lastErr?.message }
    }
  }

  return res.json({ revalidated: true, results })
}
