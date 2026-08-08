import type { NextApiRequest, NextApiResponse } from 'next'

// Protect this endpoint with a secret. Set REVALIDATE_SECRET in your environment (Vercel/ENV).
// Usage (curl):
// curl -X POST "https://your-domain.com/api/revalidate?secret=YOUR_SECRET" 
// or send header: -H "x-revalidate-secret: YOUR_SECRET"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secretFromQuery = Array.isArray(req.query.secret) ? req.query.secret[0] : req.query.secret
  const secretFromHeader = req.headers['x-revalidate-secret'] as string | undefined
  const secret = secretFromQuery || secretFromHeader

  if (!process.env.REVALIDATE_SECRET) {
    return res.status(500).json({ message: 'REVALIDATE_SECRET is not configured on the server' })
  }

  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return res.status(401).json({ message: 'Invalid secret' })
  }

  try {
    // Revalidate the ISR page(s) immediately
    await res.revalidate('/jokes-isr')
    // Optionally revalidate other pages that depend on the same cache
    await res.revalidate('/jokes-ssr')
    return res.json({ revalidated: true })
  } catch (err: any) {
    console.error('Revalidation error', err)
    return res.status(500).json({ message: 'Error revalidating', error: err?.message })
  }
}
