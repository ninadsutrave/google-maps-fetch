import { MapsError } from './http'
import type { LatLngInput } from './types'
import { toLatLng } from './util'

// Geocoding, Elevation and Time Zone aren't legacy, but they use the older JSON format:
// HTTP 200 with a status field, and the key in the query string.

export interface ClassicBody {
  status: string
  error_message?: string
}

/** The body when status is OK, undefined for ZERO_RESULTS, and a MapsError for anything else */
export const checkStatus = <T extends ClassicBody>(body: T, api: string): T | undefined => {
  if (body.status === 'OK') return body
  if (body.status === 'ZERO_RESULTS') return undefined
  throw new MapsError(body.error_message ?? `${api} failed: ${body.status}`, 200, body.status, body)
}

/** "lat,lng" */
export const point = (value: LatLngInput) => {
  const { latitude, longitude } = toLatLng(value)
  return `${latitude},${longitude}`
}

/** "lat,lng|lat,lng|..." */
export const points = (values: LatLngInput[]) => values.map(point).join('|')
