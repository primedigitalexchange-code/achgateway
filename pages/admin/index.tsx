import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'

export default function AdminPage() {
  const { data: session } = useSession()
  const [routes, setRoutes] = useState('/jokes-isr')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [setupSecret, setSetupSecret] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    // check MFA status
    fetch('/api/admin/mfa').then((r) => r.json()).then((j) => setMfaEnabled(!!j.mfaEnabled)).catch(() => setMfaEnabled(false))
  }, [session])

  async function startSetup() {
    const res = await fetch('/api/admin/mfa', { method: 'POST' })
    const j = await res.json()
    setQrData(j.qrData)
    setSetupSecret(j.secret)
  }

  async function confirmSetup(e: any) {
    e.preventDefault()
    const res = await fetch('/api/admin/mfa', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: mfaCode }) })
    if (res.ok) {
      alert('MFA enabled')
      setMfaEnabled(true)
      setQrData(null)
      setSetupSecret(null)
      setMfaCode('')
    } else {
      const j = await res.json()
      alert(j.message || 'Failed to verify')
    }
  }

  async function revalidate(e: any) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    const routesArr = routes.split(',').map((r) => r.trim()).filter(Boolean)
    const body: any = { routes: routesArr }
    if (mfaEnabled) body.mfaCode = mfaCode
    const res = await fetch('/api/admin/revalidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json()
    setResult(j)
    setLoading(false)
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui,Segoe UI,Roboto,Helvetica,Arial' }}>
      <h1>Admin: Revalidate ISR Pages</h1>
      {!session ? (
        <div>
          <p>Sign in to manage revalidation</p>
          <button onClick={() => signIn('github')}>Sign in with GitHub</button>{' '}
          <button onClick={() => signIn('google')}>Sign in with Google</button>
        </div>
      ) : (
        <div>
          <p>Signed in as {session.user?.name || session.user?.email} <button onClick={() => signOut()}>Sign out</button></p>

          {mfaEnabled === null ? <p>Checking MFA…</p> : mfaEnabled === false ? (
            <div>
              <p>MFA is not enabled for your account. You should enable MFA to perform admin actions.</p>
              {qrData ? (
                <div>
                  <p>Scan this QR code into your authenticator app and enter the code to verify:</p>
                  <img src={qrData} alt="MFA QR" />
                  <form onSubmit={confirmSetup}>
                    <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="123456" />
                    <button type="submit">Verify & Enable MFA</button>
                  </form>
                </div>
              ) : (
                <button onClick={startSetup}>Start MFA setup</button>
              )}
            </div>
          ) : (
            <div>
              <p>MFA enabled — enter code to perform admin actions.</p>
              <form onSubmit={revalidate}>
                <label>
                  Routes (comma-separated):{' '}
                  <input value={routes} onChange={(e) => setRoutes(e.target.value)} style={{ width: 400 }} />
                </label>{' '}
                <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="MFA code" />
                <button type="submit" disabled={loading}>{loading ? 'Revalidating…' : 'Revalidate'}</button>
              </form>

              {result && (
                <div style={{ marginTop: 20 }}>
                  <h3>Result</h3>
                  <pre style={{ background: '#f6f8fa', padding: 12 }}>{JSON.stringify(result, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </main>
  )
}
