import { MapsError, type CallOptions, type Send } from './http'
import type { GeocodeRequest, GeocodeResult, ReverseGeocodeRequest } from './types'
import { toLatLng } from './util'

// The Geocoding API isn't legacy, but it still uses the older JSON format: HTTP 200 with a status field
const url = 'https://maps.googleapis.com/maps/api/geocode/json'

interface GeocodeBody {
  status: string
  results?: GeocodeResult[]
  error_message?: string
}

const results = (body: GeocodeBody) => {
  if (body.status === 'OK') return body.results ?? []
  if (body.status === 'ZERO_RESULTS') return []
  throw new MapsError(body.error_message ?? `Geocoding failed: ${body.status}`, 200, body.status, body)
}

const components = (value: GeocodeRequest['components']) =>
  typeof value === 'object'
    ? Object.entries(value)
        .map(([k, v]) => `${k}:${v}`)
        .join('|')
    : value

export function createGeocoding(send: Send) {
  const geocode = async ({ address, placeId, components: filter, bounds, language, region }: GeocodeRequest, call?: CallOptions) =>
    results(
      await send<GeocodeBody>(
        {
          method: 'GET',
          url,
          keyIn: 'query',
          query: {
            address,
            place_id: placeId,
            components: components(filter),
            bounds: bounds && `${bounds.low.latitude},${bounds.low.longitude}|${bounds.high.latitude},${bounds.high.longitude}`,
            language,
            region,
          },
        },
        call,
      ),
    )

  const reverseGeocode = async ({ location, resultType, locationType, language }: ReverseGeocodeRequest, call?: CallOptions) => {
    const { latitude, longitude } = toLatLng(location)
    return results(
      await send<GeocodeBody>(
        {
          method: 'GET',
          url,
          keyIn: 'query',
          query: {
            latlng: `${latitude},${longitude}`,
            result_type: resultType?.join('|'),
            location_type: locationType?.join('|'),
            language,
          },
        },
        call,
      ),
    )
  }

  return { geocode, reverseGeocode }
}
