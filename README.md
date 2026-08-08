# nextjs-stripe-ach-financial-connections

Next.js + TypeScript example implementing:

- Instant bank verification via Stripe Financial Connections
- Micro-deposit fallback scaffold for ACH Direct Debit
- SetupIntent + PaymentIntent flows for saving a US bank account and charging
- Webhook handler for Stripe events (signature verified)

This repo is a minimal, ready-to-run scaffold. Read the notes below before running and deploying.

---

## Quick checklist (what to configure)

Environment variables (create `.env.local` for local dev or set them in Vercel):

- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= (pk_test_... or pk_live_...)
- STRIPE_SECRET_KEY= (sk_test_... or sk_live_...)
- STRIPE_WEBHOOK_SECRET= (set after running `stripe listen` or creating a webhook in the Dashboard)
- NEXT_PUBLIC_RETURN_URL=http://localhost:3000/success (update to your production URL on Vercel)

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
   # STRIPE_WEBHOOK_SECRET will be filled in after step 4 below
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

6. Example Stripe CLI triggers (useful for end-to-end testing of webhook handlers)

   The Stripe CLI can synthesize many common webhook events. Example triggers:

   - Trigger a successful PaymentIntent event (useful to test webhook handling):
     ```bash
     stripe trigger payment_intent.succeeded
     ```

   - Trigger a failed PaymentIntent event:
     ```bash
     stripe trigger payment_intent.payment_failed
     ```

   - Listens don't replay Financial Connections events reliably via `stripe trigger`; to test Financial Connections you should run the flow in the browser using the Financial Connections session created by the app and inspect events that arrive via the `stripe listen` forwarding.

---

## Test bank values (useful for micro-deposit and ACH test flows)

Stripe provides test bank routing/account values you can use in test mode for development. Use these only in test mode.

- Example (US test routing/account):
  - routing number: `110000000`
  - account number: `000123456789`

Micro-deposit verification (manual test example):
- After creating a bank token and attaching it to a customer, you can initiate micro-deposits from the Dashboard (or via API depending on account capabilities) and then confirm the amounts in your app's verification UI (e.g., 0.32 and 0.45 USD). The exact flows and APIs for initiating micro-deposits may vary by Stripe account and region; follow Stripe's docs: https://stripe.com/docs/payments/ach-debit/microdeposits

---

## Vercel deployment (detailed)

1. Create a Vercel project from this repository (import from GitHub).

2. Add the environment variables in the Vercel project settings exactly as in `.env.local`:
   - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
   - STRIPE_SECRET_KEY
   - STRIPE_WEBHOOK_SECRET (you can fill this after creating a webhook in the Stripe Dashboard pointing to your Vercel endpoint)
   - NEXT_PUBLIC_RETURN_URL=https://your-vercel-domain.vercel.app/success

3. Configure a Stripe webhook in the Stripe Dashboard:
   - Go to Developers → Webhooks → + Add endpoint
   - Endpoint URL: `https://<your-vercel-domain>/api/webhook`
   - Select events (recommended): `payment_intent.*`, `setup_intent.*`, `financial_connections.session.*` (or `*` in test). At minimum subscribe to `payment_intent.succeeded`, `payment_intent.payment_failed`, and `financial_connections.session.connected`.
   - After creating the endpoint, copy the signing secret (whsec_...) and set it as `STRIPE_WEBHOOK_SECRET` in Vercel.

4. Enable Financial Connections in your Stripe account and add the return URL(s):
   - In Dashboard search for "Financial Connections" and follow the steps to enable (may require additional onboarding depending on your account).
   - Set the redirect/return URL(s) to include your Vercel success page, e.g., `https://your-vercel-domain.vercel.app/success`.

5. Run a test payment on the deployed domain (test keys)
   - Use the deployed site and run the instant Financial Connections flow to connect a test bank account.
   - Confirm events arrive at your webhook and that the PaymentMethod/SetupIntent are created as expected.

---

## Subscription / Recurring ACH support (how to add)

This repository demonstrates one-time charges and saving bank accounts. To add subscription/recurring ACH support, follow these steps (high-level):

1. Create a recurring Price in the Dashboard (or via the API) with `recurring` settings (interval `month`/`year`) and currency `usd`.

2. Save a customer's bank account as a PaymentMethod using a SetupIntent (the repo already has `create-setup-intent` API). Ensure the SetupIntent is confirmed and the `us_bank_account` payment method is attached to the customer.

3. Create a subscription that uses the saved `payment_method`:

   - Server-side example (pseudo-code):
     ```ts
     // 1. Ensure the customer has a default payment method (us_bank_account)
     // 2. Create the subscription with `default_payment_method` set
     const subscription = await stripe.subscriptions.create({
       customer: customerId,
       items: [{ price: 'price_xxx' }],
       default_payment_method: savedPaymentMethodId,
       expand: ['latest_invoice.payment_intent'],
     })
     ```

   - ACH debits may take several days to settle and can be returned. Ensure you handle `invoice.payment_failed`, `invoice.paid`, and `charge.refunded` events in your webhook.

4. Handle invoices & dunning
   - Configure invoice settings and email receipts in Stripe (Dashboard → Billing → Customer emails) or send receipts yourself via email when webhook receives `invoice.paid`.
   - Add webhook handlers for `invoice.payment_failed`, `invoice.payment_succeeded`, and `customer.subscription.deleted`.

5. Optional: Use `payment_behavior: 'default_incomplete'` and a hosted invoice page (or payment collection) to confirm payment when subscription is created depending on your flow.

Stripe docs for subscriptions with bank debits:
https://stripe.com/docs/billing/subscriptions/payment

---

## Email receipts & fulfillment hooks (how to add)

You can either let Stripe send receipts (recommended) or send your own emails and perform fulfillment when webhooks indicate a successful payment.

1. Enable automatic email receipts in Stripe Dashboard (Settings → Email receipts). Stripe can send receipts for successful payments and invoices.

2. Fulfillment hooks (recommended server implementation):
   - In `pages/api/webhook.ts` handle events such as `payment_intent.succeeded`, `invoice.paid`, and `charge.succeeded`.
   - On `payment_intent.succeeded` or `invoice.paid`, perform fulfillment logic (e.g., mark order as paid in your DB, ship goods, provision service) and optionally send a custom email from your server (via SendGrid, Postmark, SES, etc.).

   Example pseudocode inside webhook handler:

   ```ts
   if (event.type === 'payment_intent.succeeded') {
     const pi = event.data.object;
     // 1. Lookup order by metadata or customer id
     // 2. Mark order paid in DB
     // 3. Send confirmation email via your email provider
     // 4. Trigger fulfillment workflow (inventory, shipping, webhook to 3rd-party)
   }
   ```

3. Idempotency and retries
   - Webhooks can be delivered more than once. Make your fulfillment logic idempotent (use payment intent id or invoice id as the unique key).
   - Use Stripe's `idempotency-key` for API calls that must not be duplicated.

---

## Further development suggestions

- Harden errors/edge cases and provide a clear UI for micro-deposit verification.
- Persist customers/subscriptions in a database and link payment method IDs to your user records.
- Add server-side logging and monitoring for webhook errors.
- Add automated tests for webhook handler logic using Stripe's fixtures or the Stripe CLI sample events.

---

## Where to find the important files

- `pages/index.tsx` — demo UI to start Financial Connections or micro-deposit flow
- `pages/api/create-fc-session.ts` — creates a Financial Connections session
- `pages/api/create-setup-intent.ts` — creates a SetupIntent for saving a bank account
- `pages/api/create-payment-intent.ts` — creates a PaymentIntent for a one-time charge
- `pages/api/microdeposit-token.ts` — creates a bank_account token (micro-deposit scaffold)
- `pages/api/webhook.ts` — webhook handler (verifies signature)
- `lib/stripe.ts` — Stripe client wrapper

---

If you'd like, I can now:

- Add a `pages/api/create-subscription.ts` implementation (server code) that demonstrates creating a subscription using a saved `us_bank_account` payment method and wire a simple client flow to subscribe.
- Implement a basic fulfillment/email example (e.g., integrate SendGrid and send an email on `invoice.paid`).

Which of those would you like me to implement next? Or should I add both in a follow-up commit?
