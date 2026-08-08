import type { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '../../lib/stripe'

// Create a Stripe Financial Connections session and return client_secret for the client to open
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // In a real app you would attach this to an existing customer
    const customer = await stripe.customers.create({ name: 'Jamie Klukaczewski' })

    const session = await stripe.financialConnections.sessions.create({
      account_holder: { type: 'customer', customer: customer.id },
      permissions: ['payment_method', 'balances'],
      // optional: return URL after the flow completes
      return_url: process.env.NEXT_PUBLIC_RETURN_URL || 'http://localhost:3000/success',
    })

    // The client_secret is used by Stripe.js to open the Financial Connections flow
    res.json({ client_secret: session.client_secret })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
