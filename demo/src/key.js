// The visitor's own key, kept in this browser's localStorage and only ever sent to Google.
const storageKey = 'google-maps-fetch-demo:key'

// local development can take the key from demo/.env.local instead of the form
const devKey = import.meta.env.DEV ? (import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '') : ''

export const readKey = () => {
  try {
    return localStorage.getItem(storageKey) || devKey
  } catch {
    return devKey
  }
}

export const storeKey = (key) => {
  try {
    if (key) localStorage.setItem(storageKey, key)
    else localStorage.removeItem(storageKey)
  } catch {
    // storage blocked: the key lasts until the page is closed
  }
}

// what to check when Google refuses the key
export const explain = (e) =>
  e?.code === 'PERMISSION_DENIED' ? `${e.message} Check that this API is enabled and allowed on your key.` : (e?.message ?? String(e))
