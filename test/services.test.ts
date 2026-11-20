import { describe, expect, it } from 'vitest'
import { createClient, MapsError } from '../src'
import { googleError, mockFetch, query } from './helpers'

const KEY = 'test-key'

describe('elevation', () => {
  it('sends a list of points in the query string with the key', async () => {
    const results = [{ elevation: 560.2, location: { lat: 18.52, lng: 73.85 }, resolution: 9.5 }]
    const { fetch, calls } = mockFetch(() => ({ body: { status: 'OK', results } }))
    const maps = createClient({ key: KEY, fetch })
    expect(await maps.elevation({ locations: [{ lat: 18.52, lng: 73.85 }, [19.07, 72.87]] })).toEqual(results)
    expect(calls[0].url.split('?')[0]).toBe('https://maps.googleapis.com/maps/api/elevation/json')
    expect(query(calls[0].url)).toEqual({ locations: '18.52,73.85|19.07,72.87', key: KEY })
    expect(calls[0].headers).not.toHaveProperty('X-Goog-Api-Key')
  })

  it('samples along a path', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { status: 'OK', results: [] } }))
    await createClient({ key: KEY, fetch }).elevation({ path: [{ latitude: 1, longitude: 2 }, [3, 4]], samples: 5 })
    expect(query(calls[0].url)).toMatchObject({ path: '1,2|3,4', samples: '5' })
  })

  it('throws on an error status', async () => {
    const { fetch } = mockFetch(() => ({
      body: { status: 'INVALID_REQUEST', error_message: 'Invalid request. Missing the locations parameter.' },
    }))
    const error = await createClient({ key: KEY, fetch })
      .elevation({ locations: [] })
      .catch((e) => e)
    expect(error).toBeInstanceOf(MapsError)
    expect(error).toMatchObject({ code: 'INVALID_REQUEST', status: 200, message: 'Invalid request. Missing the locations parameter.' })
  })
})

describe('timezone', () => {
  it('returns the zone, with the timestamp in seconds', async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: { status: 'OK', dstOffset: 0, rawOffset: 19800, timeZoneId: 'Asia/Calcutta', timeZoneName: 'India Standard Time' },
    }))
    const maps = createClient({ key: KEY, fetch })
    expect(await maps.timezone({ location: [18.52, 73.85], timestamp: new Date('2026-01-01T00:00:00Z'), language: 'en' })).toEqual({
      dstOffset: 0,
      rawOffset: 19800,
      timeZoneId: 'Asia/Calcutta',
      timeZoneName: 'India Standard Time',
    })
    await maps.timezone({ location: [18.52, 73.85], timestamp: 1767225600.7 })
    expect(calls[0].url.split('?')[0]).toBe('https://maps.googleapis.com/maps/api/timezone/json')
    expect(query(calls[0].url)).toEqual({ location: '18.52,73.85', timestamp: '1767225600', language: 'en', key: KEY })
    expect(query(calls[1].url).timestamp).toBe('1767225600')
  })

  it('defaults the timestamp to now', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { status: 'OK' } }))
    const before = Math.floor(Date.now() / 1000)
    await createClient({ key: KEY, fetch }).timezone({ location: [0, 0] })
    const sent = Number(query(calls[0].url).timestamp)
    expect(sent).toBeGreaterThanOrEqual(before)
    expect(sent).toBeLessThanOrEqual(before + 2)
  })

  it('open sea has no time zone', async () => {
    const { fetch } = mockFetch(() => ({ body: { status: 'ZERO_RESULTS' } }))
    expect(await createClient({ key: KEY, fetch }).timezone({ location: [0, -30] })).toBeUndefined()
  })
})

describe('geolocate', () => {
  it('posts the request with the key in a header', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { location: { lat: 18.5, lng: 73.8 }, accuracy: 1200 } }))
    const maps = createClient({ key: KEY, fetch })
    const res = await maps.geolocate({ considerIp: false, wifiAccessPoints: [{ macAddress: '01:23:45:67:89:ab', signalStrength: -60 }] })
    expect(res).toEqual({ location: { lat: 18.5, lng: 73.8 }, accuracy: 1200 })
    expect(calls[0]).toMatchObject({
      url: 'https://www.googleapis.com/geolocation/v1/geolocate',
      method: 'POST',
      body: { considerIp: false, wifiAccessPoints: [{ macAddress: '01:23:45:67:89:ab', signalStrength: -60 }] },
    })
    expect(calls[0].headers['X-Goog-Api-Key']).toBe(KEY)
  })

  it('sends an empty body by default, and a 404 means no location', async () => {
    const { fetch, calls } = mockFetch(() => ({
      status: 404,
      body: { error: { code: 404, message: 'Not Found', errors: [{ reason: 'notFound' }] } },
    }))
    const error = await createClient({ key: KEY, fetch, retries: 0 })
      .geolocate()
      .catch((e) => e)
    expect(calls[0].body).toEqual({})
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
})

describe('roads', () => {
  it('snaps a path, with interpolation', async () => {
    const snappedPoints = [{ location: { latitude: 18.52, longitude: 73.85 }, originalIndex: 0, placeId: 'r1' }]
    const { fetch, calls } = mockFetch(() => ({ body: { snappedPoints } }))
    const maps = createClient({ key: KEY, fetch })
    expect(await maps.roads.snap({ path: [[18.52, 73.85], { lat: 18.53, lng: 73.86 }], interpolate: true })).toEqual(snappedPoints)
    expect(calls[0].url.split('?')[0]).toBe('https://roads.googleapis.com/v1/snapToRoads')
    expect(query(calls[0].url)).toEqual({ path: '18.52,73.85|18.53,73.86', interpolate: 'true' })
    expect(calls[0].headers['X-Goog-Api-Key']).toBe(KEY)
  })

  it('nearest roads, and an empty answer is an empty list', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    expect(await createClient({ key: KEY, fetch }).roads.nearest({ points: [[1, 2]] })).toEqual([])
    expect(calls[0].url).toBe('https://roads.googleapis.com/v1/nearestRoads?points=1%2C2')
  })
})

describe('addressValidation', () => {
  it('validates an address', async () => {
    const response = {
      result: {
        verdict: { addressComplete: true, validationGranularity: 'PREMISE' },
        address: { formattedAddress: 'Shaniwar Wada, Pune 411030, India' },
      },
      responseId: 'r-1',
    }
    const { fetch, calls } = mockFetch(() => ({ body: response }))
    const maps = createClient({ key: KEY, fetch })
    const res = await maps.addressValidation.validate({ address: { regionCode: 'IN', addressLines: ['Shaniwar Wada', 'Pune'] } })
    expect(res).toEqual(response)
    expect(calls[0]).toMatchObject({
      url: 'https://addressvalidation.googleapis.com/v1:validateAddress',
      method: 'POST',
      body: { address: { regionCode: 'IN', addressLines: ['Shaniwar Wada', 'Pune'] } },
    })
    expect(calls[0].headers['X-Goog-Api-Key']).toBe(KEY)
  })

  it('sends feedback for a response', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    expect(
      await createClient({ key: KEY, fetch }).addressValidation.feedback({ responseId: 'r-1', conclusion: 'VALIDATED_VERSION_USED' }),
    ).toBeUndefined()
    expect(calls[0]).toMatchObject({
      url: 'https://addressvalidation.googleapis.com/v1:provideValidationFeedback',
      body: { responseId: 'r-1', conclusion: 'VALIDATED_VERSION_USED' },
    })
  })

  it('surfaces Google errors', async () => {
    const { fetch } = mockFetch(() => googleError(400, 'INVALID_ARGUMENT', 'Unsupported region code.'))
    await expect(createClient({ key: KEY, fetch }).addressValidation.validate({ address: { regionCode: 'XX' } })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      message: 'Unsupported region code.',
    })
  })
})

describe('request', () => {
  it('reaches any endpoint, with the key in a header by default and a field mask', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { indexes: [] } }))
    const maps = createClient({ key: KEY, fetch })
    const res = await maps.request<{ indexes: unknown[] }>({
      method: 'POST',
      url: 'https://airquality.googleapis.com/v1/currentConditions:lookup',
      body: { location: { latitude: 18.52, longitude: 73.85 } },
      fields: ['indexes'],
    })
    expect(res).toEqual({ indexes: [] })
    expect(calls[0].headers).toMatchObject({
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'indexes',
      'Content-Type': 'application/json',
    })
  })

  it('can put the key in the query string for the older JSON APIs', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { status: 'OK' } }))
    await createClient({ key: KEY, fetch }).request({
      method: 'GET',
      url: 'https://maps.googleapis.com/maps/api/streetview/metadata',
      query: { location: '18.52,73.85' },
      keyIn: 'query',
    })
    expect(query(calls[0].url)).toEqual({ location: '18.52,73.85', key: KEY })
  })

  it('retries and throws like every other method', async () => {
    const { fetch } = mockFetch((_, i) =>
      i === 0 ? googleError(503, 'UNAVAILABLE', 'busy') : googleError(403, 'PERMISSION_DENIED', 'API not enabled'),
    )
    await expect(
      createClient({ key: KEY, fetch }).request({ method: 'GET', url: 'https://solar.googleapis.com/v1/x' }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'PERMISSION_DENIED',
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
