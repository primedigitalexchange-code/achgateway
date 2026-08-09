import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]'
import { getRevalidationLogs } from '../../../lib/audit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ message: 'Not authenticated' })

  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10))
  const pageSize = Math.min(200, Math.max(1, parseInt((req.query.pageSize as string) || '50', 10)))
  const offset = (page - 1) * pageSize

  try {
    const items = getRevalidationLogs(pageSize, offset)
    return res.json({ page, pageSize, items })
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Failed to fetch revalidation logs' })
  }
}
