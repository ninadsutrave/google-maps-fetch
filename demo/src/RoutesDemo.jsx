import { useState } from 'react'
import { explain } from './key'
import { seconds } from 'google-maps-fetch'

const modes = ['DRIVE', 'TWO_WHEELER', 'BICYCLE', 'WALK']

const duration = (s) => {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

// One route through the Routes API with maps.routes.compute().
export function RoutesDemo({ maps }) {
  const [origin, setOrigin] = useState('Eiffel Tower, Paris')
  const [destination, setDestination] = useState('Louvre Museum, Paris')
  const [travelMode, setTravelMode] = useState('DRIVE')
  const [route, setRoute] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { routes = [] } = await maps.routes.compute({ origin, destination, travelMode, languageCode: 'en' })
      setRoute(routes[0] ?? 'none')
      setError(null)
    } catch (err) {
      setError(explain(err))
      setRoute(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="search" onSubmit={submit}>
      <label htmlFor="origin">From</label>
      <input id="origin" value={origin} onChange={(e) => setOrigin(e.target.value)} disabled={!maps} />
      <label htmlFor="destination" className="spaced">
        To
      </label>
      <input id="destination" value={destination} onChange={(e) => setDestination(e.target.value)} disabled={!maps} />
      <div className="row spaced">
        <select value={travelMode} onChange={(e) => setTravelMode(e.target.value)} disabled={!maps} aria-label="Travel mode">
          {modes.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <button type="submit" disabled={!maps || busy}>
          {busy ? 'Routing…' : 'Get route'}
        </button>
      </div>
      {error && <p className="status error">{error}</p>}
      {route === 'none' && <p className="status">No route found.</p>}
      {route && route !== 'none' && (
        <dl className="result">
          <dt>distanceMeters</dt>
          <dd>
            {route.distanceMeters} ({(route.distanceMeters / 1000).toFixed(1)} km)
          </dd>
          <dt>duration</dt>
          <dd>
            {route.duration} ({duration(seconds(route.duration))})
          </dd>
          {route.localizedValues?.distance?.text && (
            <>
              <dt>localizedValues</dt>
              <dd>
                {route.localizedValues.distance.text}, {route.localizedValues.duration?.text}
              </dd>
            </>
          )}
        </dl>
      )}
    </form>
  )
}
