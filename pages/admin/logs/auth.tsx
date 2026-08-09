import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export default function AuthEventsLogPage() {
  const { data: session } = useSession()
  const [items, setItems] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (session) fetchPage(); }, [session, page, pageSize])

  async function fetchPage() {
    setLoading(true)
    const res = await fetch(`/api/admin/logs/auth?page=${page}&pageSize=${pageSize}`)
    if (res.ok) {
      const j = await res.json()
      setItems(j.items || [])
    } else {
      setItems([])
    }
    setLoading(false)
  }

  if (!session) return <p>Please sign in to view logs.</p>

  return (
    <main style={{ padding: 24 }}>
      <h1>Auth Events</h1>
      <div style={{ marginBottom: 12 }}>
        <label>Page size: </label>
        <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1) }}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      {loading ? <p>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Email</th>
              <th>Provider</th>
              <th>Event</th>
              <th>Reason</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => (
              <tr key={it.id} style={{ borderTop: '1px solid #e1e4e8' }}>
                <td style={{ padding: 8 }}>{it.id}</td>
                <td style={{ padding: 8 }}>{it.user_email}</td>
                <td style={{ padding: 8 }}>{it.provider}</td>
                <td style={{ padding: 8 }}>{it.event}</td>
                <td style={{ padding: 8, maxWidth: 400, overflow: 'auto' }}>{it.reason}</td>
                <td style={{ padding: 8 }}>{new Date(it.created_at * 1000).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 12 }}>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>{' '}
        <span>Page {page}</span>{' '}
        <button onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </main>
  )
}
