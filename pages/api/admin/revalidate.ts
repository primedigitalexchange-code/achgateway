import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { serverRevalidate } from '../../lib/revalidate-client'
import { logRevalidation, getMfaForUser } from '../../../lib/audit'
import speakeasy from 'speakeasy'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const session = await getServerSession(req, res, authOptions)
  if (!session || !session.user || !session.user.email) return res.status(401).json({ message: 'Not authenticated' })
  const email = session.user.email as string
  const name = session.user.name as string | undefined

  const body = req.body || {}
  const routes = Array.isArray(body.routes) ? body.routes.map(String) : ['/jokes-isr']
  const mfaCode = body.mfaCode ? String(body.mfaCode) : null

  // If user has MFA enabled, require code
  const mfa = getMfaForUser(email)
  if (mfa && mfa.mfa_enabled) {
    if (!mfaCode) return res.status(401).json({ message: 'MFA code required' })
    const ok = speakeasy.totp.verify({ secret: mfa.mfa_secret, encoding: 'base32', token: mfaCode, window: 1 })
    if (!ok) return res.status(401).json({ message: 'Invalid MFA code' })
  }

  try {
    const result = await serverRevalidate(routes)
    try {
      logRevalidation(name || null, email || null, routes, result)
    } catch (e) {
      console.warn('Failed to write audit log', (e as any)?.message)
    }
    return res.json(result)
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Error calling revalidate' })
  }
}
