import type { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '../../lib/stripe'

// Create a SetupIntent to save a US bank account for future payments
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { customerId } = req.body || {}
    const customer = customerId || (await stripe.customers.create({ name: 'Jamie Klukaczewski' })).id

    const setupIntent = await stripe.setupIntents.create({
      customer,
      payment_method_types: ['us_bank_account'],
      usage: 'off_session',
    })

    res.json({ setupIntent })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
