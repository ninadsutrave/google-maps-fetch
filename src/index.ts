import { createGeocoding } from './geocode'
import { createTransport, type ClientOptions } from './http'
import { createPlaces } from './places'
import { createRoutes } from './routes'

export function createClient(options: ClientOptions) {
  const send = createTransport(options)
  return {
    places: createPlaces(send),
    routes: createRoutes(send),
    ...createGeocoding(send),
  }
}

export type MapsClient = ReturnType<typeof createClient>

export { MapsError, type CallOptions, type ClientOptions, type FetchLike, type FieldOptions } from './http'
export { placeFields, searchNearbyFields, searchTextFields, type PlaceSession, type Places } from './places'
export { matrixFields, routeFields, type Routes } from './routes'
export { newSessionToken, seconds, toLatLng, toWaypoint } from './util'
export type * from './types'
