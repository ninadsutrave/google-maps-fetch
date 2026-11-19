import { checkStatus, point, type ClassicBody } from './classic'
import type { CallOptions, Send } from './http'
import type { GeocodeRequest, GeocodeResult, ReverseGeocodeRequest } from './types'

const url = 'https://maps.googleapis.com/maps/api/geocode/json'

interface GeocodeBody extends ClassicBody {
  results?: GeocodeResult[]
}

const components = (value: GeocodeRequest['components']) =>
  typeof value === 'object'
    ? Object.entries(value)
        .map(([k, v]) => `${k}:${v}`)
        .join('|')
    : value

export function createGeocoding(send: Send) {
  const run = async (query: Record<string, string | undefined>, call?: CallOptions) =>
    checkStatus(await send<GeocodeBody>({ method: 'GET', url, keyIn: 'query', query }, call), 'Geocoding')?.results ?? []

  const geocode = ({ address, placeId, components: filter, bounds, language, region }: GeocodeRequest, call?: CallOptions) =>
    run(
      {
        address,
        place_id: placeId,
        components: components(filter),
        bounds: bounds && `${point(bounds.low)}|${point(bounds.high)}`,
        language,
        region,
      },
      call,
    )

  const reverseGeocode = ({ location, resultType, locationType, language }: ReverseGeocodeRequest, call?: CallOptions) =>
    run({ latlng: point(location), result_type: resultType?.join('|'), location_type: locationType?.join('|'), language }, call)

  return { geocode, reverseGeocode }
}
