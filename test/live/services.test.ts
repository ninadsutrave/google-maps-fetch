// Live checks for Address Validation, Elevation, Time Zone, Geolocation, Roads and request().
// Needs those APIs enabled for GOOGLE_MAPS_KEY. About 14 requests per run.
import { describe, expect, it } from 'vitest'
import { createClient } from '../../src'
import { Client } from '../../src/compat'

const key = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}).GOOGLE_MAPS_KEY

// along FC Road, Pune
const fcRoad: [number, number][] = [
  [18.5196, 73.8413],
  [18.5214, 73.8418],
  [18.5232, 73.8422],
]

describe.skipIf(!key)('live: other web APIs', () => {
  const maps = createClient({ key: key! })

  it('elevation of Pune', async () => {
    const [point] = await maps.elevation({ locations: [[18.5204, 73.8567]] })
    // Pune sits at roughly 560 m
    expect(point.elevation).toBeGreaterThan(450)
    expect(point.elevation).toBeLessThan(700)
    expect(point.location.lat).toBeCloseTo(18.5204, 3)
  })

  it('time zone of Pune', async () => {
    const zone = await maps.timezone({ location: [18.5204, 73.8567] })
    expect(zone?.timeZoneId).toMatch(/^Asia\/(Kolkata|Calcutta)$/)
    expect(zone?.rawOffset).toBe(19800)
    expect(zone?.dstOffset).toBe(0)
  })

  it('geolocates from the caller’s IP', async () => {
    const res = await maps.geolocate({ considerIp: true })
    expect(res.location.lat).toEqual(expect.any(Number))
    expect(res.accuracy).toBeGreaterThan(0)
  })

  it('snaps a GPS trace to FC Road, and finds the nearest road', async () => {
    const snapped = await maps.roads.snap({ path: fcRoad, interpolate: true })
    expect(snapped.length).toBeGreaterThanOrEqual(fcRoad.length)
    expect(snapped[0].placeId).toBeTruthy()
    expect(snapped[0].location.latitude).toBeCloseTo(18.52, 1)
    expect(snapped.some((p) => p.originalIndex === 0)).toBe(true)
    const nearest = await maps.roads.nearest({ points: [fcRoad[0]] })
    expect(nearest.length).toBeGreaterThan(0)
  })

  it('validates an address and sends feedback', async () => {
    const res = await maps.addressValidation.validate({
      address: { regionCode: 'IN', addressLines: ['Shaniwar Wada, Shaniwar Peth', 'Pune, Maharashtra 411030'] },
    })
    expect(res.responseId).toBeTruthy()
    expect(res.result.verdict).toBeTruthy()
    expect(res.result.address.formattedAddress).toMatch(/Pune/)
    expect(res.result.geocode?.location?.latitude).toBeCloseTo(18.52, 1)
    await maps.addressValidation.feedback({ responseId: res.responseId, conclusion: 'VALIDATED_VERSION_USED' })
  })

  it('request() reaches an endpoint with no typed method', async () => {
    const body = await maps.request<{ status: string; timeZoneId: string }>({
      method: 'GET',
      url: 'https://maps.googleapis.com/maps/api/timezone/json',
      query: { location: '19.076,72.8777', timestamp: 1767225600 },
      keyIn: 'query',
    })
    expect(body.status).toBe('OK')
    expect(body.timeZoneId).toMatch(/Kolkata|Calcutta/)
  })

  it('compat passthroughs still work for the same APIs', async () => {
    const client = new Client()
    const elevation = await client.elevation({ params: { key: key!, locations: [[18.5204, 73.8567]] } })
    expect((elevation.data as { status: string }).status).toBe('OK')
    const zone = await client.timezone({ params: { key: key!, location: [18.5204, 73.8567], timestamp: new Date() } })
    expect(zone.data.status).toBe('OK')
    const snapped = await client.snapToRoads({ params: { key: key!, path: fcRoad } })
    expect((snapped.data as { snappedPoints: unknown[] }).snappedPoints.length).toBeGreaterThan(0)
  })
})
