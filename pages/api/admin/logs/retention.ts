import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]'
import { runRetention } from '../../../lib/audit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ message: 'Not authenticated' })
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const days = Math.max(1, parseInt((req.body.days as string) || process.env.AUDIT_RETENTION_DAYS || '90', 10))
  try {
    const result = await runRetention(days)
    return res.json({ ok: true, result })
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Failed to run retention' })
  }
}
