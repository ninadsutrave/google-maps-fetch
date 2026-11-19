import { describe, expect, it } from 'vitest'
import { createClient, MapsError, placeFields, seconds, toWaypoint } from '../src'
import { googleError, hang, mockFetch, query } from './helpers'

const KEY = 'test-key'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('places', () => {
  it('autocomplete posts the request with the key in a header and no field mask by default', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { suggestions: [] } }))
    const maps = createClient({ key: KEY, fetch })
    const res = await maps.places.autocomplete({ input: 'Pune', includedRegionCodes: ['in'] })
    expect(res).toEqual({ suggestions: [] })
    expect(calls[0]).toMatchObject({
      url: 'https://places.googleapis.com/v1/places:autocomplete',
      method: 'POST',
      body: { input: 'Pune', includedRegionCodes: ['in'] },
    })
    expect(calls[0].headers['X-Goog-Api-Key']).toBe(KEY)
    expect(calls[0].headers['Content-Type']).toBe('application/json')
    expect(calls[0].headers).not.toHaveProperty('X-Goog-FieldMask')
    expect(calls[0].url).not.toContain(KEY)
  })

  it('get defaults to the Essentials field mask and passes options in the query string', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { id: 'abc' } }))
    const maps = createClient({ key: KEY, fetch })
    await maps.places.get('abc', { languageCode: 'hi', sessionToken: 'tok' })
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url.split('?')[0]).toBe('https://places.googleapis.com/v1/places/abc')
    expect(query(calls[0].url)).toEqual({ languageCode: 'hi', sessionToken: 'tok' })
    expect(calls[0].headers['X-Goog-FieldMask']).toBe(placeFields.join(','))
    expect(calls[0].headers['X-Goog-FieldMask']).toBe('id,formattedAddress,location')
    expect(calls[0].headers).not.toHaveProperty('Content-Type')
  })

  it('get accepts a resource name, and fields as an array or a string', async () => {
    const { fetch, calls } = mockFetch()
    const maps = createClient({ key: KEY, fetch })
    await maps.places.get('places/abc', { fields: ['displayName', 'rating'] })
    await maps.places.get('a/b c', { fields: 'id' })
    expect(calls[0].url).toBe('https://places.googleapis.com/v1/places/abc')
    expect(calls[0].headers['X-Goog-FieldMask']).toBe('displayName,rating')
    expect(calls[1].url).toBe('https://places.googleapis.com/v1/places/a%2Fb%20c')
    expect(calls[1].headers['X-Goog-FieldMask']).toBe('id')
  })

  it('a session reuses one token until get(), then starts a new one', async () => {
    const { fetch, calls } = mockFetch()
    const maps = createClient({ key: KEY, fetch })
    const session = maps.places.session()
    const first = session.token
    expect(first).toMatch(uuid)
    await session.autocomplete({ input: 'Pu' })
    await session.autocomplete({ input: 'Pun', sessionToken: 'ignored' })
    await session.get('abc')
    expect(calls[0].body.sessionToken).toBe(first)
    expect(calls[1].body.sessionToken).toBe(first)
    expect(query(calls[2].url).sessionToken).toBe(first)
    expect(session.token).not.toBe(first)
    await session.autocomplete({ input: 'M' })
    expect(calls[3].body.sessionToken).toBe(session.token)
  })

  it('a failed get still ends the session', async () => {
    const { fetch } = mockFetch(() => googleError(400, 'INVALID_ARGUMENT', 'Not a valid Place ID'))
    const maps = createClient({ key: KEY, fetch })
    const session = maps.places.session()
    const first = session.token
    await expect(session.get('bad')).rejects.toBeInstanceOf(MapsError)
    expect(session.token).not.toBe(first)
  })

  it('two sessions keep separate tokens', async () => {
    const maps = createClient({ key: KEY, fetch: mockFetch().fetch })
    expect(maps.places.session().token).not.toBe(maps.places.session().token)
  })

  it('searchText and searchNearby send their default masks', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { places: [] } }))
    const maps = createClient({ key: KEY, fetch })
    await maps.places.searchText({ textQuery: 'chai in Pune' })
    await maps.places.searchNearby({ locationRestriction: { circle: { center: { latitude: 18.5, longitude: 73.8 }, radius: 500 } } })
    expect(calls[0].url).toBe('https://places.googleapis.com/v1/places:searchText')
    expect(calls[0].headers['X-Goog-FieldMask']).toBe('places.id,places.displayName,places.formattedAddress,places.location,nextPageToken')
    expect(calls[1].url).toBe('https://places.googleapis.com/v1/places:searchNearby')
    expect(calls[1].headers['X-Goog-FieldMask']).toBe('places.id,places.displayName,places.formattedAddress,places.location,places.types')
  })

  it('photo asks for the URL instead of a redirect, with a default width', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { name: 'places/a/photos/b/media', photoUri: 'https://lh3/x' } }))
    const maps = createClient({ key: KEY, fetch })
    expect(await maps.places.photo('places/a/photos/b')).toEqual({ name: 'places/a/photos/b/media', photoUri: 'https://lh3/x' })
    await maps.places.photo('places/a/photos/b', { maxHeightPx: 300 })
    expect(calls[0].url.split('?')[0]).toBe('https://places.googleapis.com/v1/places/a/photos/b/media')
    expect(query(calls[0].url)).toEqual({ maxWidthPx: '800', skipHttpRedirect: 'true' })
    expect(query(calls[1].url)).toEqual({ maxHeightPx: '300', skipHttpRedirect: 'true' })
  })
})

describe('routes', () => {
  it('compute turns shorthand waypoints into Waypoints and sends a field mask', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { routes: [{ distanceMeters: 1200, duration: '300s' }] } }))
    const maps = createClient({ key: KEY, fetch })
    const res = await maps.routes.compute({
      origin: 'Shaniwar Wada, Pune',
      destination: { lat: 18.53, lng: 73.84 },
      intermediates: [[18.52, 73.85], { placeId: 'xyz' }, { latitude: 1, longitude: 2 }],
      travelMode: 'TWO_WHEELER',
    })
    expect(res.routes?.[0].distanceMeters).toBe(1200)
    expect(calls[0].url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes')
    expect(calls[0].body).toEqual({
      travelMode: 'TWO_WHEELER',
      origin: { address: 'Shaniwar Wada, Pune' },
      destination: { location: { latLng: { latitude: 18.53, longitude: 73.84 } } },
      intermediates: [
        { location: { latLng: { latitude: 18.52, longitude: 73.85 } } },
        { placeId: 'xyz' },
        { location: { latLng: { latitude: 1, longitude: 2 } } },
      ],
    })
    expect(calls[0].headers['X-Goog-FieldMask']).toContain('routes.duration')
  })

  it('matrix fills in index 0, which JSON leaves out', async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: [
        { destinationIndex: 1, condition: 'ROUTE_EXISTS', distanceMeters: 5 },
        { originIndex: 1, condition: 'ROUTE_EXISTS' },
        { condition: 'ROUTE_EXISTS' },
      ],
    }))
    const maps = createClient({ key: KEY, fetch })
    const elements = await maps.routes.matrix({
      origins: ['Pune', { waypoint: { placeId: 'p' }, routeModifiers: { avoidTolls: true } }],
      destinations: [{ lat: 1, lng: 2 }, { waypoint: { address: 'Mumbai' } }],
    })
    expect(elements.map((e) => [e.originIndex, e.destinationIndex])).toEqual([
      [0, 1],
      [1, 0],
      [0, 0],
    ])
    expect(calls[0].url).toBe('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix')
    expect(calls[0].body.origins).toEqual([
      { waypoint: { address: 'Pune' } },
      { waypoint: { placeId: 'p' }, routeModifiers: { avoidTolls: true } },
    ])
    expect(calls[0].body.destinations).toEqual([
      { waypoint: { location: { latLng: { latitude: 1, longitude: 2 } } } },
      { waypoint: { address: 'Mumbai' } },
    ])
  })

  it('matrix leaves indexes alone when they are not in the field mask', async () => {
    const { fetch } = mockFetch(() => ({ body: [{ distanceMeters: 5 }] }))
    const maps = createClient({ key: KEY, fetch })
    expect(await maps.routes.matrix({ origins: ['a'], destinations: ['b'] }, { fields: 'distanceMeters' })).toEqual([{ distanceMeters: 5 }])
  })

  it('helpers: seconds and toWaypoint', () => {
    expect(seconds('1234s')).toBe(1234)
    expect(seconds('3.5s')).toBe(3.5)
    expect(seconds(undefined)).toBeUndefined()
    expect(toWaypoint({ address: 'x', via: true })).toEqual({ address: 'x', via: true })
  })
})

describe('geocoding', () => {
  it('sends the key in the query string and returns results', async () => {
    const results = [{ place_id: 'p', formatted_address: 'Pune' }]
    const { fetch, calls } = mockFetch(() => ({ body: { status: 'OK', results } }))
    const maps = createClient({ key: KEY, fetch })
    expect(
      await maps.geocode({
        address: 'FC Road',
        components: { country: 'IN', postal_code: '411004' },
        bounds: { low: { latitude: 18, longitude: 73 }, high: { latitude: 19, longitude: 74 } },
        language: 'en',
      }),
    ).toEqual(results)
    expect(calls[0].url.split('?')[0]).toBe('https://maps.googleapis.com/maps/api/geocode/json')
    expect(query(calls[0].url)).toEqual({
      address: 'FC Road',
      components: 'country:IN|postal_code:411004',
      bounds: '18,73|19,74',
      language: 'en',
      key: KEY,
    })
    expect(calls[0].headers).not.toHaveProperty('X-Goog-Api-Key')
  })

  it('reverse geocodes coordinates in any shape', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { status: 'OK', results: [] } }))
    const maps = createClient({ key: KEY, fetch })
    await maps.reverseGeocode({ location: [18.5, 73.8], resultType: ['street_address', 'route'] })
    expect(query(calls[0].url)).toMatchObject({ latlng: '18.5,73.8', result_type: 'street_address|route' })
  })

  it('ZERO_RESULTS is an empty list, other statuses throw', async () => {
    let reply: unknown = { status: 'ZERO_RESULTS', results: [] }
    const { fetch } = mockFetch(() => ({ body: reply }))
    const maps = createClient({ key: KEY, fetch })
    expect(await maps.geocode({ address: 'nowhere' })).toEqual([])
    reply = { status: 'REQUEST_DENIED', error_message: 'API key not valid' }
    const error = await maps.geocode({ address: 'x' }).catch((e) => e)
    expect(error).toBeInstanceOf(MapsError)
    expect(error).toMatchObject({ code: 'REQUEST_DENIED', status: 200, message: 'API key not valid' })
  })
})

describe('errors, retries and timeouts', () => {
  it('turns a Google error body into a MapsError and does not retry a 400', async () => {
    const { fetch } = mockFetch(() => googleError(400, 'INVALID_ARGUMENT', 'Invalid input'))
    const maps = createClient({ key: KEY, fetch })
    const error = await maps.places.autocomplete({ input: '' }).catch((e) => e)
    expect(error).toBeInstanceOf(MapsError)
    expect(error).toMatchObject({ name: 'MapsError', status: 400, code: 'INVALID_ARGUMENT', message: 'Invalid input' })
    expect(error.response).toEqual({ status: 400, data: { error: { code: 400, message: 'Invalid input', status: 'INVALID_ARGUMENT' } } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('handles an error body that is not JSON', async () => {
    const { fetch } = mockFetch(() => ({ status: 403, body: '<html>Forbidden</html>' }))
    const maps = createClient({ key: KEY, fetch })
    await expect(maps.places.get('x')).rejects.toMatchObject({ status: 403, code: 'PERMISSION_DENIED', message: 'HTTP 403' })
  })

  it('retries a 503 and succeeds', async () => {
    const { fetch } = mockFetch((_, i) => (i === 0 ? googleError(503, 'UNAVAILABLE', 'try again') : { body: { id: 'ok' } }))
    const maps = createClient({ key: KEY, fetch })
    expect(await maps.places.get('x')).toEqual({ id: 'ok' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after the configured retries', async () => {
    const { fetch } = mockFetch(() => googleError(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded'))
    const maps = createClient({ key: KEY, fetch, retries: 1 })
    await expect(maps.places.get('x')).rejects.toMatchObject({ status: 429, code: 'RESOURCE_EXHAUSTED' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries a network error', async () => {
    const { fetch } = mockFetch((_, i) => (i === 0 ? new TypeError('fetch failed') : { body: { id: 'ok' } }))
    const maps = createClient({ key: KEY, fetch })
    expect(await maps.places.get('x')).toEqual({ id: 'ok' })
  })

  it('reports a network error once retries run out', async () => {
    const { fetch } = mockFetch(() => new TypeError('fetch failed'))
    const maps = createClient({ key: KEY, fetch, retries: 0 })
    await expect(maps.places.get('x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR', message: 'mapsfetch: fetch failed' })
  })

  it('times out a request that never answers', async () => {
    const { fetch } = mockFetch(hang)
    const maps = createClient({ key: KEY, fetch, retries: 0 })
    await expect(maps.places.get('x', { timeout: 30 })).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 })
  })

  it('a timeout is retried with a fresh timer', async () => {
    const { fetch } = mockFetch((call, i) => (i === 0 ? hang(call) : { body: { id: 'ok' } }))
    const maps = createClient({ key: KEY, fetch, timeout: 30 })
    expect(await maps.places.get('x')).toEqual({ id: 'ok' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("the caller's abort is not retried and keeps its reason", async () => {
    const { fetch } = mockFetch(hang)
    const maps = createClient({ key: KEY, fetch })
    const controller = new AbortController()
    const pending = maps.places.get('x', { signal: controller.signal })
    setTimeout(() => controller.abort(new Error('user left')), 10)
    await expect(pending).rejects.toThrow('user left')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('an already-aborted signal never calls fetch', async () => {
    const { fetch } = mockFetch()
    const maps = createClient({ key: KEY, fetch })
    const controller = new AbortController()
    controller.abort()
    await expect(maps.places.get('x', { signal: controller.signal })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('an abort during the backoff wait stops the retry', async () => {
    const { fetch } = mockFetch(() => googleError(503, 'UNAVAILABLE', 'busy'))
    const maps = createClient({ key: KEY, fetch })
    const controller = new AbortController()
    const pending = maps.places.get('x', { signal: controller.signal })
    setTimeout(() => controller.abort(new Error('stop')), 50)
    await expect(pending).rejects.toThrow('stop')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('needs a key and a fetch', () => {
    expect(() => createClient({ key: '' })).toThrow('an API key is required')
    expect(() => createClient({ key: KEY, fetch: 'nope' as never })).toThrow('no fetch available')
  })

  it('sends extra headers on every request', async () => {
    const { fetch, calls } = mockFetch()
    const maps = createClient({ key: KEY, fetch, headers: { 'X-Goog-User-Project': 'my-project' } })
    await maps.places.get('x')
    expect(calls[0].headers['X-Goog-User-Project']).toBe('my-project')
  })

  it('uses the global fetch by default', async () => {
    const { fetch } = mockFetch(() => ({ body: { id: 'g' } }))
    const original = globalThis.fetch
    globalThis.fetch = fetch as never
    try {
      expect(await createClient({ key: KEY }).places.get('x')).toEqual({ id: 'g' })
    } finally {
      globalThis.fetch = original
    }
  })
})
