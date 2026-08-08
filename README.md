# Next.js + TypeScript Stripe ACH (Financial Connections + micro-deposits)

This repository is a starter kit that demonstrates:

- Instant bank verification via Stripe Financial Connections
- Micro-deposit fallback scaffold for ACH Direct Debit
- SetupIntent + PaymentIntent flows for saving a US bank account and charging
- Webhook handler for Stripe events (signature verified)

Important: This is a demo scaffold. Before going to production, read Stripe docs and enable Financial Connections in your Stripe account.

Environment variables (create `.env.local` locally or set in Vercel):

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_RETURN_URL=http://localhost:3000/success

Quick start (local):

1. Install dependencies
   npm install

2. Create `.env.local` from `.env.example` and fill keys.

3. Run dev server
   npm run dev

4. Forward webhooks locally using Stripe CLI and copy the webhook secret to STRIPE_WEBHOOK_SECRET
   stripe listen --forward-to localhost:3000/api/webhook

5. Open http://localhost:3000

Vercel deployment:
- Create a Vercel project from this repo
- Add the same environment variables in the Vercel dashboard
- Configure a Stripe webhook to point to https://<your-vercel>/api/webhook and copy the signing secret to STRIPE_WEBHOOK_SECRET

Notes:
- The micro-deposit verification flow is included as a scaffold and instructions; verifying micro-deposits requires following Stripe's guide for your chosen approach and may need small code changes depending on the API version and requirements.
- Replace sample UI text (business/display name) with your real business name. In this repo demo the display name is "Jamie Klukaczewski" and sample bank shown is "Chime Bank".

References:
- https://stripe.com/docs/financial-connections
- https://stripe.com/docs/payments/save-and-reuse
- https://stripe.com/docs/payments/ach-debit
