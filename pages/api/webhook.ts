import type { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '../../lib/stripe'

// Webhook handler to receive Stripe events (financial_connections.session.revoked, financial_connections.session.connected, payment_intent.succeeded, etc.)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sig = req.headers['stripe-signature'] as string | undefined
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set')
    return res.status(500).send('Webhook secret not configured')
  }

  let event
  try {
    // Raw body is required to verify signature. Next.js by default parses JSON, so we use the buffer approach.
    const buf = await buffer(req)
    event = stripe.webhooks.constructEvent(buf.toString(), sig || '', webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err?.message)
    return res.status(400).send(`Webhook Error: ${err?.message}`)
  }

  // Handle the event types you care about
  switch (event.type) {
    case 'financial_connections.session.connected':
      // A customer connected a bank account via Financial Connections. The event object will include the linked accounts info.
      console.log('Financial Connections session connected', event.data.object)
      break
    case 'payment_intent.succeeded':
      console.log('PaymentIntent succeeded', event.data.object)
      break
    case 'payment_intent.payment_failed':
      console.log('Payment failed', event.data.object)
      break
    default:
      console.log(`Unhandled event type ${event.type}`)
  }

  res.json({ received: true })
}

// Helper to get raw body buffer for Next.js API route (since we need the raw body for Stripe signature verification)
import { NextApiRequest as Req } from 'next'
import getRawBody from 'raw-body'
async function buffer(req: Req) {
  return await getRawBody(req)
}
