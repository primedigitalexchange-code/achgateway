import type { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '../../lib/stripe'

// Create a PaymentIntent to collect a one-time ACH charge (requires a saved payment method or a payment method from Financial Connections)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { customerId, amount } = req.body || {}
    const customer = customerId || (await stripe.customers.create({ name: 'Jamie Klukaczewski' })).id

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount || 500, // amount in cents
      currency: 'usd',
      customer,
      payment_method_types: ['us_bank_account'],
      // For ACH debits it's common to use manual capture or confirm flows depending on your needs
    })

    res.json({ paymentIntent })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
