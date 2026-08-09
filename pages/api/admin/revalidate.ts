import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { serverRevalidate } from '../../../lib/revalidate-client'
import { logRevalidation } from '../../../lib/audit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ message: 'Not authenticated' })

  const body = req.body || {}
  const routes = Array.isArray(body.routes) ? body.routes.map(String) : ['/jokes-isr']

  try {
    const result = await serverRevalidate(routes)
    // Audit log: record who triggered it and the result
    try {
      const userName = (session.user && (session.user.name as string)) || null
      const userEmail = (session.user && (session.user.email as string)) || null
      logRevalidation(userName, userEmail, routes, result)
    } catch (e) {
      console.warn('Failed to write audit log', (e as any)?.message)
    }
    return res.json(result)
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Error calling revalidate' })
  }
}
