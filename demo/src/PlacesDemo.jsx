import { useEffect, useRef, useState } from 'react'
import { explain } from './key'

// Autocomplete and Place Details in one billed session, through maps.places.session().
export function PlacesDemo({ maps }) {
  const session = useRef(null)
  const timer = useRef()
  const latest = useRef(0)
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [place, setPlace] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    session.current = maps?.places.session() ?? null
  }, [maps])
  useEffect(() => () => clearTimeout(timer.current), [])

  const search = async (input) => {
    const id = ++latest.current
    try {
      const res = await session.current.autocomplete({ input })
      if (id === latest.current) setSuggestions((res.suggestions ?? []).filter((s) => s.placePrediction))
      setError(null)
    } catch (e) {
      if (id === latest.current) setError(explain(e))
    }
  }

  const onChange = (e) => {
    const next = e.target.value
    setValue(next)
    clearTimeout(timer.current)
    if (!next.trim()) return setSuggestions([])
    timer.current = setTimeout(() => search(next), 250)
  }

  const pick = async ({ placePrediction: p }) => {
    latest.current++
    clearTimeout(timer.current)
    setValue(p.text.text)
    setSuggestions([])
    try {
      // ends the session; the next search gets a new token
      setPlace(await session.current.get(p.placeId))
      setError(null)
    } catch (e) {
      setError(explain(e))
    }
  }

  return (
    <div className="search">
      <label htmlFor="places-input">Search a place</label>
      <input
        id="places-input"
        value={value}
        onChange={onChange}
        disabled={!maps}
        placeholder={maps ? 'Start typing…' : 'Add your key above first'}
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <ul role="listbox">
          {suggestions.map((s) => (
            <li key={s.placePrediction.placeId} role="option" aria-selected={false} onClick={() => pick(s)}>
              <strong>{s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text.text}</strong>{' '}
              <span>{s.placePrediction.structuredFormat?.secondaryText?.text}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="status error">{error}</p>}
      {place && (
        <dl className="result">
          <dt>formattedAddress</dt>
          <dd>{place.formattedAddress}</dd>
          <dt>location</dt>
          <dd>
            {place.location?.latitude.toFixed(5)}, {place.location?.longitude.toFixed(5)}
          </dd>
          <dt>id</dt>
          <dd>{place.id}</dd>
        </dl>
      )}
    </div>
  )
}
