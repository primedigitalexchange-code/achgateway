import type { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '../../lib/stripe'
import { sendEmail } from '../../lib/email'

// Webhook handler to receive Stripe events (financial_connections.session.revoked, financial_connections.session.connected, payment_intent.succeeded, etc.)
// Extended to send email receipts and perform basic fulfillment hooks on invoice.paid and payment_intent.succeeded.

// NOTE: This handler uses an in-memory Set to deduplicate events during the process lifetime. For production,
// store processed event IDs in a durable data store (database) to make deduplication reliable across restarts.

const processedEvents = new Set<string>()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sig = req.headers['stripe-signature'] as string | undefined
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set')
    return res.status(500).send('Webhook secret not configured')
  }

  let event
  try {
    const buf = await buffer(req)
    event = stripe.webhooks.constructEvent(buf.toString(), sig || '', webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err?.message)
    return res.status(400).send(`Webhook Error: ${err?.message}`)
  }

  // Basic idempotency: ignore events we've processed in this process
  if (processedEvents.has(event.id)) {
    console.log('Duplicate event received, ignoring:', event.id)
    return res.json({ received: true })
  }
  processedEvents.add(event.id)

  try {
    switch (event.type) {
      case 'financial_connections.session.connected':
        console.log('Financial Connections session connected', event.data.object)
        break

      case 'payment_intent.succeeded':
        console.log('PaymentIntent succeeded', event.data.object)
        await handlePaymentIntentSucceeded(event.data.object)
        break

      case 'payment_intent.payment_failed':
        console.log('Payment failed', event.data.object)
        // Optionally inform customer about failure
        break

      case 'invoice.paid':
        console.log('Invoice paid', event.data.object)
        await handleInvoicePaid(event.data.object)
        break

      case 'invoice.payment_failed':
        console.log('Invoice payment failed', event.data.object)
        // Optionally handle dunning / retry / notify customer
        break

      default:
        console.log(`Unhandled event type ${event.type}`)
    }
  } catch (err: any) {
    console.error('Error handling webhook event', err?.message)
    // Do not fail signature verification; return 200 to acknowledge or 500 to let Stripe retry depending on your needs.
    return res.status(500).send('Webhook handler error')
  }

  res.json({ received: true })
}

async function handlePaymentIntentSucceeded(paymentIntent: any) {
  // Attempt to find a customer email to send a receipt and perform fulfillment
  const customerId = paymentIntent.customer
  let email: string | null = null
  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId)
    email = (customer as any).email || null
  }

  // Fallback to receipt_email on the PaymentIntent
  email = email || paymentIntent.receipt_email || null

  // Fulfillment placeholder: mark order as fulfilled in DB (not implemented)
  const orderId = paymentIntent.metadata?.order_id || null
  console.log('Fulfillment: would fulfill order', orderId || '(no order id provided)')

  // Send confirmation email (if email exists)
  if (email) {
    try {
      await sendEmail(
        email,
        'Payment received',
        `We received your payment. PaymentIntent: ${paymentIntent.id}`,
        `<p>We received your payment. PaymentIntent: <strong>${paymentIntent.id}</strong></p>`
      )
      console.log('Sent payment receipt to', email)
    } catch (err: any) {
      console.error('Failed to send email', err?.message)
    }
  }
}

async function handleInvoicePaid(invoice: any) {
  // Invoice object might contain customer and lines
  const customerId = invoice.customer
  let email: string | null = null
  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId)
    email = (customer as any).email || null
  }
  email = email || invoice.customer_email || null

  // Fulfillment placeholder: mark subscription as active / provision services
  const subscriptionId = invoice.subscription
  console.log('Fulfillment: invoice paid for subscription', subscriptionId)

  if (email) {
    try {
      await sendEmail(
        email,
        'Subscription payment received',
        `Your subscription payment for invoice ${invoice.id} was received. Thank you!`,
        `<p>Your subscription payment for invoice <strong>${invoice.id}</strong> was received. Thank you!</p>`
      )
      console.log('Sent subscription receipt to', email)
    } catch (err: any) {
      console.error('Failed to send invoice email', err?.message)
    }
  }
}

// Helper to get raw body buffer for Next.js API route (since we need the raw body for Stripe signature verification)
import { NextApiRequest as Req } from 'next'
import getRawBody from 'raw-body'
async function buffer(req: Req) {
  return await getRawBody(req)
}
