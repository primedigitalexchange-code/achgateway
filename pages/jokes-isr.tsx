import Head from 'next/head'
import { GetStaticProps } from 'next'

type Props = {
  joke: string
}

export default function JokesISRPage({ joke }: Props) {
  return (
    <>
      <Head>
        <title>Random Joke — Quick Laugh (ISR)</title>
        <meta name="description" content="A random joke cached with Incremental Static Regeneration (ISR) for fast page loads and SEO." />
        <meta property="og:title" content="Random Joke — Quick Laugh (ISR)" />
        <meta property="og:description" content="A random joke cached with Incremental Static Regeneration (ISR) for fast page loads and SEO." />
      </Head>

      <main style={{ padding: 24, fontFamily: 'system-ui,Segoe UI,Roboto,Helvetica,Arial' }}>
        <h1>Random Joke (ISR)</h1>
        <div style={{ marginTop: 16, minHeight: 72 }}>
          <blockquote style={{ fontSize: 18, lineHeight: 1.4 }}>{joke}</blockquote>
        </div>

        <div style={{ marginTop: 20 }}>
          <a href="/jokes-ssr">Server-side rendered joke</a> · <a href="/jokes">Client-side joke generator</a>
        </div>

        <p style={{ marginTop: 20, color: '#666' }}>
          This page is statically generated and will be regenerated periodically on the server (ISR). Change the
          revalidation interval using the environment variable <code>JOKE_REVALIDATE_SECONDS</code>.
        </p>
      </main>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const revalidateSeconds = parseInt(process.env.JOKE_REVALIDATE_SECONDS || '60', 10)

  try {
    const r = await fetch('https://icanhazdadjoke.com/', {
      headers: { Accept: 'application/json', 'User-Agent': 'Next.js Joke Generator (ISR)' },
    })

    if (r.ok) {
      const j = await r.json()
      if (j && j.joke) {
        return { props: { joke: j.joke }, revalidate: revalidateSeconds }
      }
    }

    const r2 = await fetch('https://official-joke-api.appspot.com/random_joke')
    if (r2.ok) {
      const j2 = await r2.json()
      const text = j2.setup && j2.punchline ? `${j2.setup} — ${j2.punchline}` : j2.joke || ''
      if (text) return { props: { joke: text }, revalidate: revalidateSeconds }
    }

    return { props: { joke: 'No joke available right now — try again shortly.' }, revalidate: revalidateSeconds }
  } catch (err) {
    console.error('ISR joke fetch error', err)
    return { props: { joke: 'Failed to fetch a joke.' }, revalidate: revalidateSeconds }
  }
}
