import type { LatLng, LatLngInput, Waypoint, WaypointInput } from './types'

export const toLatLng = (value: LatLngInput): LatLng => {
  if (Array.isArray(value)) return { latitude: value[0], longitude: value[1] }
  if ('lat' in value) return { latitude: value.lat, longitude: value.lng }
  return { latitude: value.latitude, longitude: value.longitude }
}

const isWaypoint = (value: object): value is Waypoint => 'location' in value || 'placeId' in value || 'address' in value

/** Turns an address, coordinates or a Waypoint into a Routes API Waypoint */
export const toWaypoint = (value: WaypointInput): Waypoint => {
  if (typeof value === 'string') return { address: value }
  if (!Array.isArray(value) && isWaypoint(value)) return value
  return { location: { latLng: toLatLng(value as LatLngInput) } }
}

/** "1234s" (a Routes API duration) to 1234 */
export const seconds = (duration: string | undefined): number | undefined => (duration === undefined ? undefined : parseFloat(duration))

/** A random session token for Places autocomplete */
export const newSessionToken = (): string => globalThis.crypto.randomUUID()
