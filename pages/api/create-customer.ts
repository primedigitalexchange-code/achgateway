import type { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '../../lib/stripe'

// Create or return a Stripe Customer (for demo we create a new one per call)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { name, email } = req.body || {}
    const customer = await stripe.customers.create({
      name: name || 'Jamie Klukaczewski',
      email: email || undefined,
    })
    res.json({ customer })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
