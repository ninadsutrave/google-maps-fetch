// A fetch that records every request google-maps-fetch sends, for the log on the page.
// The key is never recorded: it travels in a header, or in the query string for the older APIs, and both are left out.
const listeners = new Set()
let entries = []

const add = (entry) => {
  entries = [{ ...entry, id: entries.length }, ...entries].slice(0, 40)
  listeners.forEach((listener) => listener())
}

export const getEntries = () => entries
export const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const sessionTokenOf = (url, body) => {
  const fromQuery = url.searchParams.get('sessionToken') ?? url.searchParams.get('sessiontoken')
  if (fromQuery) return fromQuery
  try {
    return JSON.parse(body ?? '{}').sessionToken ?? null
  } catch {
    return null
  }
}

export async function loggingFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url)
  const method = init.method ?? 'GET'
  const fieldMask = new Headers(init.headers).get('X-Goog-FieldMask')
  const session = sessionTokenOf(url, init.body)
  url.searchParams.delete('key')
  const started = performance.now()
  const base = { method, path: `${url.host}${url.pathname}`, fieldMask, session }
  try {
    const res = await fetch(input, init)
    add({ ...base, status: res.status, ms: Math.round(performance.now() - started) })
    return res
  } catch (error) {
    add({ ...base, status: 'network error', ms: Math.round(performance.now() - started) })
    throw error
  }
}
