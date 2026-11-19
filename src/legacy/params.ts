// Legacy request values (as @googlemaps/google-maps-services-js accepts them) converted for the new APIs
import type { Area, LatLng, Waypoint } from '../types'

export interface LatLngLiteral {
  lat: number
  lng: number
}

/** [lat, lng], "lat,lng", { lat, lng } or { latitude, longitude } */
export type LegacyLatLng = [number, number] | string | LatLngLiteral | { latitude: number; longitude: number }

export interface LatLngBounds {
  northeast: LatLngLiteral
  southwest: LatLngLiteral
}

const pair = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

export const parseLatLng = (value: string): LatLng | undefined => {
  const m = pair.exec(value)
  return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : undefined
}

export const toLatLng = (value: LegacyLatLng): LatLng => {
  if (typeof value === 'string') {
    const parsed = parseLatLng(value)
    if (!parsed) throw new Error(`google-maps-fetch/compat: expected "lat,lng" but got "${value}"`)
    return parsed
  }
  if (Array.isArray(value)) return { latitude: value[0], longitude: value[1] }
  if ('lat' in value) return { latitude: value.lat, longitude: value.lng }
  return { latitude: value.latitude, longitude: value.longitude }
}

export const toLiteral = (value: LatLng | undefined): LatLngLiteral => ({ lat: value?.latitude ?? 0, lng: value?.longitude ?? 0 })

export const latLngString = (value: LegacyLatLng) => {
  if (typeof value === 'string') return value
  const { latitude, longitude } = toLatLng(value)
  return `${latitude},${longitude}`
}

/** "place_id:...", "via:...", an address, "lat,lng" or coordinates, as the Directions API took them */
export const toWaypoint = (value: LegacyLatLng): Waypoint => {
  if (typeof value !== 'string') return { location: { latLng: toLatLng(value) } }
  const via = value.startsWith('via:')
  const v = via ? value.slice(4) : value
  if (v.startsWith('enc:')) throw new Error('google-maps-fetch/compat: encoded-polyline waypoints ("enc:...") are not supported')
  const coords = parseLatLng(v)
  const point: Waypoint = v.startsWith('place_id:') ? { placeId: v.slice(9) } : coords ? { location: { latLng: coords } } : { address: v }
  return via ? { ...point, via: true } : point
}

/**
 * What to show for a legacy waypoint in start_address, end_address and the matrix address lists. The Routes API doesn't
 * geocode inputs back to addresses, so this echoes the address string, "lat,lng" for coordinates, or "" for a place ID.
 */
export const addressOf = (value: LegacyLatLng | undefined) => {
  if (value === undefined) return ''
  if (typeof value !== 'string') return latLngString(value)
  const v = value.startsWith('via:') ? value.slice(4) : value
  return v.startsWith('place_id:') ? '' : v
}

const metresPerDegree = 111_320

/** A circle's bounding box, since Text Search only restricts to rectangles */
export const circleToRectangle = (center: LatLng, radius: number): { rectangle: { low: LatLng; high: LatLng } } => {
  const dLat = radius / metresPerDegree
  const dLng = radius / (metresPerDegree * Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01))
  return {
    rectangle: {
      low: { latitude: Math.max(center.latitude - dLat, -90), longitude: Math.max(center.longitude - dLng, -180) },
      high: { latitude: Math.min(center.latitude + dLat, 90), longitude: Math.min(center.longitude + dLng, 180) },
    },
  }
}

/** Find Place's locationbias: "ipbias", "point:lat,lng", "circle:radius@lat,lng" or "rectangle:south,west|north,east" */
export const parseLocationBias = (value: string | undefined): Area | undefined => {
  if (!value || value === 'ipbias') return undefined
  const [kind, rest = ''] = value.split(/:(.*)/s)
  if (kind === 'point') return { circle: { center: toLatLng(rest), radius: 0 } }
  if (kind === 'circle') {
    const [radius, center] = rest.split('@')
    return { circle: { center: toLatLng(center), radius: Number(radius) } }
  }
  if (kind === 'rectangle') {
    const [low, high] = rest.split('|')
    return { rectangle: { low: toLatLng(low), high: toLatLng(high) } }
  }
  throw new Error(`google-maps-fetch/compat: unrecognised locationbias "${value}"`)
}

const isLatLngObject = (v: object) => ('lat' in v && 'lng' in v) || ('latitude' in v && 'longitude' in v)

/** Serialises a value the way the legacy client did, for the APIs we call unchanged (Geocoding, Elevation, ...) */
export const serializeValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined
  if (value instanceof Date) return String(Math.round(value.getTime() / 1000))
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((n) => typeof n === 'number')) return value.join(',')
    return value.map(serializeValue).join('|')
  }
  if (typeof value === 'object') {
    if (isLatLngObject(value)) return latLngString(value as LegacyLatLng)
    if ('northeast' in value && 'southwest' in value) {
      const { northeast, southwest } = value as LatLngBounds
      return `${latLngString(southwest)}|${latLngString(northeast)}`
    }
    return Object.entries(value)
      .map(([k, v]) => `${k}:${v}`)
      .join('|')
  }
  return String(value)
}

export const serializeParams = (params: Record<string, unknown>) => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    const s = serializeValue(v)
    if (s !== undefined) out[k] = s
  }
  return out
}

const priceLevels = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
]

/** minprice/maxprice (0-4) to priceLevels. Free isn't accepted as a filter, so the range starts at 1; an empty range is no filter. */
export const priceRange = (min?: number, max?: number) => {
  if (min == null && max == null) return undefined
  const levels = priceLevels.slice(Math.max(min ?? 0, 1), (max ?? 4) + 1)
  return levels.length ? levels : undefined
}

export const priceLevelNumber = (level: string | undefined) => {
  const i = level ? priceLevels.indexOf(level) : -1
  return i === -1 ? undefined : i
}

/** Drops undefined values, so requests and responses only carry what was set */
export const strip = <T extends Record<string, unknown>>(o: T): T => {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return o
}
