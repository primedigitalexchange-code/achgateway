// Server-side helper to fetch jokes with caching and retry/backoff
import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL || ''
const cacheTtlSeconds = parseInt(process.env.JOKE_CACHE_TTL_SECONDS || process.env.JOKE_REVALIDATE_SECONDS || '60', 10)
const cacheKey = 'joke:latest'

let redis: Redis | null = null
if (redisUrl) {
  try {
    redis = new Redis(redisUrl)
  } catch (err) {
    console.warn('Failed to initialize Redis client:', err)
    redis = null
  }
}

type MemCacheEntry = { value: string; expiresAt: number }
const memCache = new Map<string, MemCacheEntry>()

async function fetchWithRetry(url: string, init?: RequestInit, attempts = 3, baseDelayMs = 200): Promise<Response> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (err) {
      lastErr = err
      const delay = baseDelayMs * Math.pow(2, i)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

async function fetchJokeFromSources(): Promise<string | null> {
  // Primary: icanhazdadjoke
  try {
    const r = await fetchWithRetry('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json', 'User-Agent': 'Next.js Joke Generator (cache)' } })
    const j = await r.json()
    if (j && j.joke) return j.joke
  } catch (err) {
    // ignore and fallback
  }

  // Fallback: official-joke-api
  try {
    const r2 = await fetchWithRetry('https://official-joke-api.appspot.com/random_joke')
    const j2 = await r2.json()
    const text = j2 && (j2.setup && j2.punchline ? `${j2.setup} — ${j2.punchline}` : j2.joke)
    if (text) return text
  } catch (err) {
    // ignore
  }

  return null
}

export async function getJoke(): Promise<string> {
  // 1) Try in-memory cache
  const now = Date.now()
  const mem = memCache.get(cacheKey)
  if (mem && mem.expiresAt > now) {
    return mem.value
  }

  // 2) Try Redis cache if available
  if (redis) {
    try {
      const v = await redis.get(cacheKey)
      if (v) return v
    } catch (err) {
      console.warn('Redis get failed', err)
    }
  }

  // 3) Fetch from upstream with retry/backoff
  const joke = (await fetchJokeFromSources()) || 'No joke available right now — try again shortly.'

  // 4) Store in caches
  const expiresAt = Date.now() + cacheTtlSeconds * 1000
  memCache.set(cacheKey, { value: joke, expiresAt })

  if (redis) {
    try {
      await redis.set(cacheKey, joke, 'EX', cacheTtlSeconds)
    } catch (err) {
      console.warn('Redis set failed', err)
    }
  }

  return joke
}
