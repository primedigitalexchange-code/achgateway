import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]'
import { exportRevalidationCsv } from '../../../lib/audit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ message: 'Not authenticated' })

  const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) || '1000', 10)))
  try {
    const csv = await exportRevalidationCsv(limit)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="revalidations_${Date.now()}.csv"`)
    res.send(csv)
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Failed to export CSV' })
  }
}
