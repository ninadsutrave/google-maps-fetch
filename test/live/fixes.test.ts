// Live checks for the review fixes: legacy field names Google must accept, paging with only a pagetoken,
// '*' field masks in the matrix, Google's error bodies, and timeout 0. About 9 requests per run.
import { describe, expect, it } from 'vitest'
import { createClient, MapsError } from '../../src'
import { Client, Status } from '../../src/compat'

const key = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}).GOOGLE_MAPS_KEY

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!key)('live: review fixes', () => {
  const client = new Client()

  it('legacy field names map to fields Google accepts', async () => {
    const found = await client.findPlaceFromText({
      params: { key: key!, input: 'Vaishali restaurant FC Road Pune', inputtype: 'textquery' },
    })
    const placeId = found.data.candidates[0]?.place_id
    expect(placeId).toBeTruthy()
    const res = await client.placeDetails({
      params: {
        key: key!,
        place_id: placeId!,
        fields: [
          'name',
          'icon',
          'opening_hours',
          'secondary_opening_hours',
          'wheelchair_accessible_entrance',
          'price_level',
          'vicinity',
          'plus_code',
          'utc_offset',
          'adr_address',
          'url',
          'website',
          'rating',
          'user_ratings_total',
          'business_status',
        ],
      },
    })
    // an unknown field in the mask makes Google reject the whole call
    expect(res.data.error_message).toBeUndefined()
    expect(res.data.status).toBe(Status.OK)
    expect(res.data.result.name).toBeTruthy()
    expect(res.data.result.icon).toMatch(/^https:\/\/.+\.png$/)
    expect(res.data.result.utc_offset).toBe(330)
    expect(
      typeof res.data.result.wheelchair_accessible_entrance === 'boolean' || res.data.result.wheelchair_accessible_entrance === undefined,
    ).toBe(true)
  })

  it('fields as a comma-separated string', async () => {
    const res = await client.findPlaceFromText({
      params: { key: key!, input: 'Shaniwar Wada Pune', inputtype: 'textquery', fields: 'place_id,formatted_address' as never },
    })
    expect(res.data.status).toBe(Status.OK)
    expect(res.data.candidates[0].formatted_address).toMatch(/Pune/)
  })

  it('textSearch pages with only the pagetoken, as legacy code does', async () => {
    const first = await client.textSearch({ params: { key: key!, query: 'cafes in Pune' } })
    expect(first.data.status).toBe(Status.OK)
    const pagetoken = first.data.next_page_token
    expect(pagetoken).toBeTruthy()
    let second = await client.textSearch({ params: { key: key!, pagetoken } as never })
    // the legacy API needed a moment before a new token worked; allow one retry in case the new one does too
    if (second.data.status !== Status.OK) {
      await pause(2000)
      second = await client.textSearch({ params: { key: key!, pagetoken } as never })
    }
    expect(second.data.error_message).toBeUndefined()
    expect(second.data.status).toBe(Status.OK)
    const firstIds = new Set(first.data.results.map((r) => r.place_id))
    expect(second.data.results.some((r) => !firstIds.has(r.place_id))).toBe(true)
  })

  it("matrix fills the indexes with fields: '*'", async () => {
    const maps = createClient({ key: key! })
    const [element] = await maps.routes.matrix({ origins: ['Pune'], destinations: ['Mumbai'], languageCode: 'en' }, { fields: '*' })
    expect(element.originIndex).toBe(0)
    expect(element.destinationIndex).toBe(0)
    expect(element.distanceMeters).toBeGreaterThan(100_000)
  })

  it("a matrix error keeps Google's message", async () => {
    const maps = createClient({ key: key!, retries: 0 })
    const error = await maps.routes.matrix({ origins: ['Pune'], destinations: ['Mumbai'], travelMode: 'NOT_A_MODE' }).catch((e) => e)
    expect(error).toBeInstanceOf(MapsError)
    expect(error.status).toBe(400)
    expect(error.message).not.toBe('HTTP 400')
    expect(error.message.length).toBeGreaterThan(10)
  })

  it('timeout 0 means no timeout', async () => {
    const maps = createClient({ key: key!, timeout: 0 })
    const [result] = await maps.geocode({ address: 'Shaniwar Wada, Pune' })
    expect(result.formatted_address).toMatch(/Pune/)
  })
})
