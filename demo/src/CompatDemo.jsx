import { useState } from 'react'

// The legacy @googlemaps/google-maps-services-js calls, answered by the new APIs through google-maps-fetch/compat.
export function CompatDemo({ client, apiKey }) {
  const [input, setInput] = useState('Shaniwar Wada')
  const [predictions, setPredictions] = useState([])
  const [details, setDetails] = useState(null)
  const [error, setError] = useState(null)

  const show = (data) => {
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') setError(`${data.status}: ${data.error_message ?? ''}`)
    else setError(null)
  }

  const search = async (e) => {
    e.preventDefault()
    setDetails(null)
    try {
      const { data } = await client.placeAutocomplete({ params: { input, key: apiKey } })
      show(data)
      setPredictions(data.predictions ?? [])
    } catch (err) {
      setError(err.message)
    }
  }

  const pick = async (p) => {
    setPredictions([])
    try {
      const { data } = await client.placeDetails({ params: { place_id: p.place_id, key: apiKey } })
      show(data)
      setDetails(data)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="search">
      <form onSubmit={search}>
        <label htmlFor="compat-input">client.placeAutocomplete</label>
        <div className="row">
          <input id="compat-input" value={input} onChange={(e) => setInput(e.target.value)} disabled={!apiKey} autoComplete="off" />
          <button type="submit" disabled={!apiKey}>
            Search
          </button>
        </div>
      </form>
      {predictions.length > 0 && (
        <ul role="listbox">
          {predictions.map((p) => (
            <li key={p.place_id} role="option" aria-selected={false} onClick={() => pick(p)}>
              <strong>{p.structured_formatting?.main_text}</strong> <span>{p.structured_formatting?.secondary_text}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="status error">{error}</p>}
      {details && (
        <>
          <p className="hint">client.placeDetails returned the legacy shape:</p>
          <pre className="json">
            <code>{JSON.stringify(details, null, 2)}</code>
          </pre>
        </>
      )}
    </div>
  )
}
