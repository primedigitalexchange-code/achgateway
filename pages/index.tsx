import { useState } from 'react'

export default function Home() {
  const [loading, setLoading] = useState(false)
  const startFinancialConnections = async () => {
    setLoading(true)
    const res = await fetch('/api/create-fc-session', { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (data?.client_secret) {
      const stripe = (window as any).Stripe ? (window as any).Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null
      if (!stripe || !stripe.financialConnections) {
        alert('Stripe.js or Financial Connections not available. Make sure you included the Stripe script and enabled Financial Connections in your account.')
        return
      }
      // Open Financial Connections. This will redirect the user to the bank selection/consent flow.
      await stripe.financialConnections.open({ client_secret: data.client_secret })
      // The user will be redirected back to the return URL configured in STRIPE dashboard (or NEXT_PUBLIC_RETURN_URL)
    } else {
      alert('Could not create Financial Connections session')
    }
  }

  const startMicroDepositFlow = async () => {
    // navigate to a simple micro-deposit form page (not implemented as a separate page in this scaffold)
    const name = prompt('Enter account holder full name for micro-deposit demo (e.g. Jane Doe)')
    if (!name) return
    const routing = prompt('Enter routing number (e.g. 110000000)')
    const account = prompt('Enter account number (e.g. 000123456789)')
    if (!routing || !account) return
    const res = await fetch('/api/microdeposit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_holder_name: name, routing_number: routing, account_number: account })
    })
    const data = await res.json()
    alert('Micro-deposit bank token created (demo). See README to complete verification: ' + JSON.stringify(data))
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>ACH Demo (Jamie Klukaczewski)</h1>
      <p>Demo bank shown in UI: Chime Bank</p>

      <div style={{ marginTop: 20 }}>
        <button onClick={startFinancialConnections} disabled={loading}>
          {loading ? 'Starting...' : 'Pay with Bank (Instant verify via Financial Connections)'}
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={startMicroDepositFlow}>Use Micro-deposit fallback (enter routing/account)</button>
      </div>

      <script src="https://js.stripe.com/v3/"></script>
    </div>
  )
}
