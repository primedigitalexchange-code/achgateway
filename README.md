# nextjs-stripe-ach-financial-connections

Next.js + TypeScript example implementing:

- Instant bank verification via Stripe Financial Connections
- Micro-deposit fallback scaffold for ACH Direct Debit
- SetupIntent + PaymentIntent flows for saving a US bank account and charging
- Webhook handler for Stripe events (signature verified)
- Subscription creation for recurring ACH
- Email receipts & fulfillment hook examples using SendGrid

This repo is a minimal, ready-to-run scaffold. Read the notes below before running and deploying.

---

## Quick checklist (what to configure)

Environment variables (create `.env.local` for local dev or set them in Vercel):

- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= (pk_test_... or pk_live_...)
- STRIPE_SECRET_KEY= (sk_test_... or sk_live_...)
- STRIPE_WEBHOOK_SECRET= (set after running `stripe listen` or creating a webhook in the Dashboard)
- NEXT_PUBLIC_RETURN_URL=http://localhost:3000/success (update to your production URL on Vercel)
- STRIPE_PRICE_ID= (price_... for subscriptions, optional)

SendGrid (for custom email receipts)
- SENDGRID_API_KEY= (create a SendGrid API key and store it securely)
- EMAIL_FROM= (e.g., "Billing <billing@yourdomain.com>")

Do NOT commit these values to source control.

---

## Local development (detailed)

1. Install dependencies

   npm install

2. Create `.env.local` using the variables above. Example `.env.local`:

   ```env
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_12345
   STRIPE_SECRET_KEY=sk_test_12345
   NEXT_PUBLIC_RETURN_URL=http://localhost:3000/success
   # STRIPE_WEBHOOK_SECRET will be filled in after step 5 below
   SENDGRID_API_KEY=SG.xxxxx
   EMAIL_FROM="Jamie Klukaczewski <billing@yourdomain.com>"
   ```

3. Start the Next.js dev server

   npm run dev

   The app will be available at http://localhost:3000

4. Forward Stripe webhooks to your local machine and capture the webhook signing secret

   - Install the Stripe CLI if you haven't: https://stripe.com/docs/stripe-cli
   - Run the listen command (this forwards Stripe events to your local webhook endpoint):

     ```bash
     stripe listen --forward-to localhost:3000/api/webhook
     ```

     The CLI will output a webhook signing secret like `whsec_...` after it starts listening.

   - Copy that `whsec_...` value and add it to `.env.local` as `STRIPE_WEBHOOK_SECRET` (or set it in Vercel before deploying).

5. Test flows

   - Open http://localhost:3000 and click "Pay with Bank (Instant verify via Financial Connections)".
   - For micro-deposit fallback, click "Use Micro-deposit fallback" and enter test routing/account numbers when prompted.

6. Test email receipts

   - Make sure `SENDGRID_API_KEY` and `EMAIL_FROM` are set in `.env.local`.
   - When the webhook receives `payment_intent.succeeded` or `invoice.paid` it will attempt to send an email using SendGrid to the customer's email on record.

---

## Notes on receipts & fulfillment

- The webhook handler demonstrates sending emails and logging fulfillment actions. Production systems should:
  - Persist webhook event IDs in a database to deduplicate events across process restarts.
  - Persist customers, payment methods, invoices, and subscriptions in a database to drive idempotent fulfillment.
  - Use retries and alerting for failed webhook handlers and email sends.

---

(Other README sections omitted here for brevity; see repository README for full details.)
