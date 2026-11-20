import { useMemo, useState, useSyncExternalStore } from 'react'
import { createClient } from 'google-maps-fetch'
import { Client } from 'google-maps-fetch/compat'
import { readKey, storeKey } from './key'
import { getEntries, loggingFetch, subscribe } from './requestLog'
import { PlacesDemo } from './PlacesDemo'
import { RoutesDemo } from './RoutesDemo'
import { CompatDemo } from './CompatDemo'

const repo = 'https://github.com/ninadsutrave/google-maps-fetch'
const install = 'npm install google-maps-fetch'

const usage = `import { createClient } from 'google-maps-fetch'

const maps = createClient({ key: process.env.GOOGLE_MAPS_KEY })

// autocomplete and details in one billed session
const session = maps.places.session()
const { suggestions = [] } = await session.autocomplete({ input: 'Eiffel Tower' })
const place = await session.get(suggestions[0].placePrediction.placeId)

const { routes = [] } = await maps.routes.compute({ origin: 'Paris', destination: 'Amsterdam' })`

const compatDiff = `- import { Client } from '@googlemaps/google-maps-services-js'
+ import { Client } from 'google-maps-fetch/compat'`

const tabs = {
  places: 'Places API (New): autocomplete, then the details call that ends the session.',
  routes: 'Routes API: one route with distance and duration.',
  compat: 'The google-maps-services-js methods, answered by the new APIs, in the legacy response shape.',
}

function Copy({ text }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      // clipboard blocked; the text is still selectable
    }
  }
  return (
    <button type="button" className="copy" onClick={copy}>
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

function KeyForm({ apiKey, onChange }) {
  const [draft, setDraft] = useState(apiKey)
  const [shown, setShown] = useState(false)
  return (
    <form
      className="key"
      onSubmit={(e) => {
        e.preventDefault()
        onChange(draft.trim())
      }}
    >
      <label htmlFor="key">Your Google Maps API key</label>
      <div className="row">
        <input
          id="key"
          type={shown ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="AIza…"
          autoComplete="off"
          spellCheck="false"
        />
        <button type="button" className="ghost" onClick={() => setShown((s) => !s)}>
          {shown ? 'Hide' : 'Show'}
        </button>
        <button type="submit">{apiKey ? 'Update' : 'Use key'}</button>
        {apiKey && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setDraft('')
              onChange('')
            }}
          >
            Forget
          </button>
        )}
      </div>
      <p className="privacy">
        <b>We never store or see your key.</b> It stays in this browser&apos;s local storage and goes only to Google, with each request.
        This page is static files on GitHub Pages, with no server, analytics or tracking.{' '}
        <a href={`${repo}/tree/main/demo/src`}>Check the code</a>, and use <b>Forget</b> to remove the key.
      </p>
      <p className="hint">
        The key needs <b>Places API (New)</b> and <b>Routes API</b>, and its website restrictions must allow{' '}
        <code>https://ninadsutrave.github.io/*</code>. In a real app, keep the key on your server: the browser is only for trying it out. A
        separate key with low daily quotas is a good idea.
      </p>
    </form>
  )
}

function RequestLog() {
  const entries = useSyncExternalStore(subscribe, getEntries)
  return (
    <aside className="log" aria-live="polite">
      <h3>Requests to Google</h3>
      {entries.length === 0 ? (
        <p className="hint">Every request google-maps-fetch sends shows up here: endpoint, field mask, session token, status and time.</p>
      ) : (
        <ol className="requests">
          {entries.map((e) => (
            <li key={e.id} className={typeof e.status === 'number' && e.status < 400 ? undefined : 'error'}>
              <span className="kind">
                {e.method} {e.status} · {e.ms} ms
              </span>
              <span className="text">{e.path}</span>
              {e.fieldMask && <span className="detail">field mask: {e.fieldMask}</span>}
              {e.session && <span className="detail">session: {e.session.slice(0, 8)}…</span>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}

export function App() {
  const [apiKey, setApiKey] = useState(readKey)
  const [tab, setTab] = useState('places')
  const maps = useMemo(() => (apiKey ? createClient({ key: apiKey, fetch: loggingFetch }) : null), [apiKey])
  const client = useMemo(() => new Client({ fetch: loggingFetch }), [])

  const changeKey = (key) => {
    storeKey(key)
    setApiKey(key)
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Fetch client · Google Maps Platform</p>
        <h1>google-maps-fetch</h1>
        <p className="byline">
          by <a href="https://ninadsutrave.com">Ninad Sutrave</a>
        </p>
        <p className="lede">
          A small client for Places API (New), Routes, Geocoding and the other Maps web APIs, built on fetch with no dependencies. Runs on
          Node, Bun, Deno, Cloudflare Workers and Vercel Edge, and in this page. Includes a drop-in replacement for
          @googlemaps/google-maps-services-js.
        </p>
        <div className="install">
          <code>{install}</code>
          <Copy text={install} />
        </div>
        <nav>
          <a href={repo}>GitHub</a>
          <a href="https://www.npmjs.com/package/google-maps-fetch">npm</a>
          <a href={`${repo}#readme`}>Docs</a>
        </nav>
      </header>

      <section>
        <h2>Try it</h2>
        <KeyForm apiKey={apiKey} onChange={changeKey} />
        <div className="tabs" role="tablist">
          {Object.keys(tabs).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === 'compat' ? '/compat' : t}
            </button>
          ))}
        </div>
        <div className="demo">
          <div>
            {tab === 'places' && <PlacesDemo maps={maps} />}
            {tab === 'routes' && <RoutesDemo maps={maps} />}
            {tab === 'compat' && <CompatDemo client={client} apiKey={apiKey} />}
            <p className="hint">{tabs[tab]}</p>
          </div>
          <RequestLog />
        </div>
      </section>

      <section>
        <h2>Usage</h2>
        <pre>
          <code>{usage}</code>
        </pre>
        <p>Coming from @googlemaps/google-maps-services-js? Change the import:</p>
        <pre className="diff">
          <code>{compatDiff}</code>
        </pre>
      </section>

      <footer>
        Made by <a href="https://ninadsutrave.com">Ninad Sutrave</a>. MIT licensed. Not affiliated with Google. <a href={repo}>Source</a>
      </footer>
    </main>
  )
}
