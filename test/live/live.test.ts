// Calls Google's real APIs. Needs GOOGLE_MAPS_KEY in .env.local (Places API (New), Routes API and
// Geocoding API enabled). Run with: npm run test:live
// One run makes about 4 autocomplete, 4 details, 2 text search, 2 nearby, 2 route, 6 matrix-element and 3 geocoding calls.
import { describe, expect, it } from 'vitest'
import { createClient, MapsError, placeFields } from '../../src'
import { Client, Status, TravelMode } from '../../src/compat'

const key = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}).GOOGLE_MAPS_KEY

// Shaniwar Wada, Pune
const wada = { latitude: 18.5195, longitude: 73.8553 }
const near = (a: number, b: number, tolerance = 0.05) => Math.abs(a - b) < tolerance

describe.skipIf(!key)('live: google-maps-fetch', () => {
  const maps = createClient({ key: key! })

  it('autocomplete then details in one session, with only the default fields back', async () => {
    const session = maps.places.session()
    const { suggestions = [] } = await session.autocomplete({ input: 'Shaniwar Wada', includedRegionCodes: ['in'] })
    const prediction = suggestions.find((s) => s.placePrediction)?.placePrediction
    expect(prediction?.placeId).toBeTruthy()
    expect(prediction?.text.text).toMatch(/Shaniwar/i)
    const place = await session.get(prediction!.placeId)
    expect(place.formattedAddress).toMatch(/Pune/)
    expect(near(place.location!.latitude, wada.latitude)).toBe(true)
    expect(near(place.location!.longitude, wada.longitude)).toBe(true)
    // the field mask was honoured: nothing beyond the Essentials fields came back
    expect(Object.keys(place).every((k) => placeFields.includes(k))).toBe(true)
  })

  it('an unknown place ID is a MapsError with Google’s status', async () => {
    const error = await maps.places.get('not-a-real-place-id').catch((e) => e)
    expect(error).toBeInstanceOf(MapsError)
    expect([400, 404]).toContain(error.status)
    expect(error.code).toMatch(/INVALID_ARGUMENT|NOT_FOUND/)
    expect(error.message.length).toBeGreaterThan(0)
  })

  it('text search', async () => {
    const res = await maps.places.searchText({ textQuery: 'misal pav in Pune', pageSize: 3 })
    expect(res.places?.length).toBeGreaterThan(0)
    expect(res.places!.length).toBeLessThanOrEqual(3)
    for (const p of res.places!) {
      expect(p.id).toBeTruthy()
      expect(p.displayName?.text).toBeTruthy()
      expect(p.location?.latitude).toEqual(expect.any(Number))
    }
  })

  it('nearby search', async () => {
    const res = await maps.places.searchNearby({
      locationRestriction: { circle: { center: wada, radius: 1000 } },
      includedTypes: ['cafe'],
      maxResultCount: 3,
    })
    expect(res.places?.length).toBeGreaterThan(0)
    expect(res.places![0].types).toContain('cafe')
  })

  it('computes a route from address strings', async () => {
    const { routes = [] } = await maps.routes.compute({
      origin: 'Pune Railway Station, Pune',
      destination: 'Chhatrapati Shivaji Maharaj Terminus, Mumbai',
      // without it the Routes API picks a language from the origin (Assamese, for this route)
      languageCode: 'en',
    })
    expect(routes).toHaveLength(1)
    expect(routes[0].distanceMeters).toBeGreaterThan(130_000)
    expect(routes[0].distanceMeters).toBeLessThan(220_000)
    expect(routes[0].duration).toMatch(/^\d+s$/)
    expect(routes[0].polyline?.encodedPolyline?.length).toBeGreaterThan(100)
    expect(routes[0].localizedValues?.distance?.text).toMatch(/km/)
  })

  it('computes a matrix with every index filled in, including 0', async () => {
    const elements = await maps.routes.matrix({ origins: ['Pune', 'Nashik'], destinations: ['Mumbai', [wada.latitude, wada.longitude]] })
    expect(elements).toHaveLength(4)
    const pairs = elements.map((e) => `${e.originIndex}-${e.destinationIndex}`).sort()
    expect(pairs).toEqual(['0-0', '0-1', '1-0', '1-1'])
    const puneToWada = elements.find((e) => e.originIndex === 0 && e.destinationIndex === 1)!
    const nashikToMumbai = elements.find((e) => e.originIndex === 1 && e.destinationIndex === 0)!
    expect(puneToWada.distanceMeters).toBeLessThan(15_000)
    expect(nashikToMumbai.distanceMeters).toBeGreaterThan(130_000)
    expect(elements.every((e) => e.condition === 'ROUTE_EXISTS')).toBe(true)
  })

  it('geocodes and reverse geocodes', async () => {
    const [result] = await maps.geocode({ address: 'FC Road, Pune', components: { country: 'IN' } })
    expect(result.formatted_address).toMatch(/Pune/)
    const back = await maps.reverseGeocode({ location: wada })
    expect(back.length).toBeGreaterThan(0)
    expect(back[0].formatted_address).toMatch(/Pune/)
  })
})

describe.skipIf(!key)('live: google-maps-fetch/compat', () => {
  const client = new Client()

  it('placeAutocomplete and placeDetails, sharing a session token', async () => {
    const sessiontoken = globalThis.crypto.randomUUID()
    const auto = await client.placeAutocomplete({
      params: { key: key!, input: 'Vaishali FC Road', components: ['country:in'], sessiontoken },
    })
    expect(auto.data.status).toBe(Status.OK)
    const p = auto.data.predictions[0]
    expect(p.place_id).toBeTruthy()
    expect(p.structured_formatting.main_text).toBeTruthy()
    for (const m of p.matched_substrings) expect(Number.isInteger(m.offset) && m.length > 0).toBe(true)
    const details = await client.placeDetails({
      params: { key: key!, place_id: p.place_id, sessiontoken, fields: ['name', 'geometry', 'formatted_address'] },
    })
    expect(details.data.status).toBe(Status.OK)
    expect(details.data.result.name).toBeTruthy()
    expect(details.data.result.geometry?.location.lat).toEqual(expect.any(Number))
    expect(details.data.result.geometry?.viewport?.northeast.lat).toEqual(expect.any(Number))
  })

  it('placeAutocomplete type filters are accepted by the new API', async () => {
    const cities = await client.placeAutocomplete({ params: { key: key!, input: 'Pun', types: '(cities)', components: ['country:in'] } })
    expect(cities.data.error_message).toBeUndefined()
    expect(cities.data.status).toBe(Status.OK)
    const addresses = await client.placeAutocomplete({ params: { key: key!, input: '1218 FC Road Pune', types: 'address' } })
    expect(addresses.data.error_message).toBeUndefined()
    expect([Status.OK, Status.ZERO_RESULTS]).toContain(addresses.data.status)
  })

  it('textSearch and placesNearby return legacy-shaped places', async () => {
    const text = await client.textSearch({ params: { key: key!, query: 'vada pav near FC Road Pune' } })
    expect(text.data.status).toBe(Status.OK)
    expect(text.data.results[0].place_id).toBeTruthy()
    expect(text.data.results[0].geometry?.location.lat).toEqual(expect.any(Number))
    const nearby = await client.placesNearby({
      params: { key: key!, location: { lat: wada.latitude, lng: wada.longitude }, radius: 800, type: 'restaurant' },
    })
    expect(nearby.data.status).toBe(Status.OK)
    expect(nearby.data.results[0].name).toBeTruthy()
  })

  it('directions with a waypoint and traffic', async () => {
    const res = await client.directions({
      params: {
        key: key!,
        origin: 'Pune',
        destination: 'Mumbai',
        waypoints: ['Lonavala, Maharashtra'],
        mode: TravelMode.driving,
        departure_time: 'now',
      },
    })
    expect(res.data.status).toBe(Status.OK)
    const [route] = res.data.routes
    expect(route.legs).toHaveLength(2)
    expect(route.legs[0].start_address).toBe('Pune')
    expect(route.legs[1].end_address).toBe('Mumbai')
    expect(route.legs[0].duration.value).toBeGreaterThan(0)
    expect(route.legs[0].duration.text).toMatch(/min|hour/)
    expect(route.legs[0].duration_in_traffic?.value).toBeGreaterThan(0)
    expect(route.legs[0].steps[0].html_instructions).toBeTruthy()
    expect(route.overview_polyline.points.length).toBeGreaterThan(100)
    expect(route.bounds?.northeast.lat).toBeGreaterThan(route.bounds!.southwest.lat)
  })

  it('distancematrix fills the grid', async () => {
    const res = await client.distancematrix({
      params: { key: key!, origins: ['Pune, Maharashtra'], destinations: ['Mumbai, Maharashtra', 'Nashik, Maharashtra'] },
    })
    expect(res.data.status).toBe(Status.OK)
    expect(res.data.rows).toHaveLength(1)
    for (const e of res.data.rows[0].elements) {
      expect(e.status).toBe('OK')
      expect(e.distance!.value).toBeGreaterThan(100_000)
      expect(e.duration!.text).toMatch(/hour|min/)
    }
  })

  it('geocode passes through, and an API error resolves with a legacy status', async () => {
    const geo = await client.geocode({ params: { key: key!, address: 'Shaniwar Wada', components: { country: 'IN' } } })
    expect(geo.data.status).toBe('OK')
    const bad = await client.placeDetails({ params: { key: key!, place_id: 'not-a-real-place-id' } })
    expect([400, 404]).toContain(bad.status)
    expect([Status.INVALID_REQUEST, Status.NOT_FOUND]).toContain(bad.data.status)
    expect(bad.data.error_message).toBeTruthy()
  })
})
