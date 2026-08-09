import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]'
import speakeasy from 'speakeasy'
import qrcode from 'qrcode'
import { ensureUser, setMfaSecret, getMfaForUser, enableMfa } from '../../../../lib/audit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || !session.user || !session.user.email) return res.status(401).json({ message: 'Not authenticated' })
  const email = session.user.email as string
  const name = session.user.name as string | undefined

  if (req.method === 'GET') {
    // return whether user has MFA enabled
    const info = getMfaForUser(email)
    return res.json({ mfaEnabled: !!(info && info.mfa_enabled) })
  }

  if (req.method === 'POST') {
    // create a secret and return QR code data
    ensureUser(email, name)
    const secret = speakeasy.generateSecret({ name: `Quick Laugh (${email})` })
    // store temp secret (not enabled until verified)
    setMfaSecret(email, secret.base32)
    const otpauth = secret.otpauth_url || ''
    const qrData = await qrcode.toDataURL(otpauth)
    return res.json({ qrData, secret: secret.base32 })
  }

  if (req.method === 'PUT') {
    // verify code and enable MFA
    const body = req.body || {}
    const code = String(body.code || '')
    const info = getMfaForUser(email)
    if (!info || !info.mfa_secret) return res.status(400).json({ message: 'No MFA secret configured' })
    const verified = speakeasy.totp.verify({ secret: info.mfa_secret, encoding: 'base32', token: code, window: 1 })
    if (!verified) return res.status(400).json({ message: 'Invalid code' })
    enableMfa(email)
    return res.json({ ok: true })
  }

  res.setHeader('Allow', 'GET,POST,PUT')
  res.status(405).end('Method not allowed')
}
