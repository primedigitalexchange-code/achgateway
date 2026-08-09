import { useSession, signIn, signOut } from 'next-auth/react'
import { useState } from 'react'

export default function AdminPage() {
  const { data: session } = useSession()
  const [routes, setRoutes] = useState('/jokes-isr')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function revalidate(e: any) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    const routesArr = routes.split(',').map((r) => r.trim()).filter(Boolean)
    const res = await fetch('/api/admin/revalidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routes: routesArr }) })
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

          <form onSubmit={revalidate}>
            <label>
              Routes (comma-separated):{' '}
              <input value={routes} onChange={(e) => setRoutes(e.target.value)} style={{ width: 400 }} />
            </label>{' '}
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
    </main>
  )
}
