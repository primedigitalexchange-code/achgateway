import type { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '../../lib/stripe'

// Create a token for micro-deposit flow using account details provided by the customer.
// This token can be attached as a payment method or used to create a bank account on the customer.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { account_holder_name, routing_number, account_number } = req.body || {}
    if (!account_holder_name || !routing_number || !account_number) {
      return res.status(400).json({ error: 'Missing bank account details' })
    }

    // Create a bank_account token (server-side)
    const token = await stripe.tokens.create({
      bank_account: {
        country: 'US',
        currency: 'usd',
        account_holder_name,
        account_holder_type: 'individual',
        routing_number,
        account_number,
      },
    })

    // In your app you would attach this token to a Customer (stripe.customers.createSource or create a PaymentMethod) and then kick off micro-deposits.
    res.json({ token })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
