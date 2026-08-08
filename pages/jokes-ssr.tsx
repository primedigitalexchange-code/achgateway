import Head from 'next/head'
import { GetServerSideProps } from 'next'

type Props = {
  joke: string
}

export default function JokesSSRPage({ joke }: Props) {
  return (
    <>
      <Head>
        <title>Random Joke — Quick Laugh</title>
        <meta name="description" content="Read a random joke fetched server-side for better SEO and fast first paint." />
        <meta property="og:title" content="Random Joke — Quick Laugh" />
        <meta property="og:description" content="Read a random joke fetched server-side for better SEO and fast first paint." />
      </Head>

      <main style={{ padding: 24, fontFamily: 'system-ui,Segoe UI,Roboto,Helvetica,Arial' }}>
        <h1>Random Joke (Server-side rendered)</h1>
        <div style={{ marginTop: 16, minHeight: 72 }}>
          <blockquote style={{ fontSize: 18, lineHeight: 1.4 }}>{joke}</blockquote>
        </div>

        <div style={{ marginTop: 20 }}>
          <a href="/jokes">Client-side joke generator</a>
        </div>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  // Try icanhazdadjoke first (single-line jokes), fall back to official-joke-api
  try {
    const r = await fetch('https://icanhazdadjoke.com/', {
      headers: { Accept: 'application/json', 'User-Agent': 'Next.js Joke Generator (SSR)' },
    })

    if (r.ok) {
      const j = await r.json()
      if (j && j.joke) {
        return { props: { joke: j.joke } }
      }
    }

    const r2 = await fetch('https://official-joke-api.appspot.com/random_joke')
    if (r2.ok) {
      const j2 = await r2.json()
      const text = j2.setup && j2.punchline ? `${j2.setup} — ${j2.punchline}` : j2.joke || ''
      if (text) return { props: { joke: text } }
    }

    return { props: { joke: 'No joke available right now — try again shortly.' } }
  } catch (err) {
    console.error('SSR joke fetch error', err)
    return { props: { joke: 'Failed to fetch a joke.' } }
  }
}
