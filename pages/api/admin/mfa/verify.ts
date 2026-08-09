import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]'
import { getMfaForUser } from '../../../../lib/audit'
import speakeasy from 'speakeasy'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || !session.user || !session.user.email) return res.status(401).json({ message: 'Not authenticated' })
  const email = session.user.email as string

  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const body = req.body || {}
  const code = String(body.code || '')
  const info = getMfaForUser(email)
  if (!info || !info.mfa_secret) return res.status(400).json({ message: 'MFA not configured' })
  const verified = speakeasy.totp.verify({ secret: info.mfa_secret, encoding: 'base32', token: code, window: 1 })
  if (!verified) return res.status(400).json({ message: 'Invalid code' })
  return res.json({ ok: true })
}
