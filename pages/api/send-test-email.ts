import type { NextApiRequest, NextApiResponse } from 'next'
import { sendEmail } from '../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { to } = req.body || {}
  if (!to) return res.status(400).json({ error: 'missing to' })
  try {
    await sendEmail(to, 'Test email from ACH demo', 'This is a test email (text).', '<p>This is a <strong>test</strong> email (HTML).</p>')
    res.json({ ok: true })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
