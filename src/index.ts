import { createAddressValidation } from './addressvalidation'
import { createGeocoding } from './geocode'
import { createTransport, type CallOptions, type ClientOptions, type Request } from './http'
import { createPlaces } from './places'
import { createRoutes } from './routes'
import { createServices } from './services'

export function createClient(options: ClientOptions) {
  const send = createTransport(options)
  return {
    places: createPlaces(send),
    routes: createRoutes(send),
    addressValidation: createAddressValidation(send),
    ...createGeocoding(send),
    ...createServices(send),
    /**
     * Any Google Maps Platform REST endpoint, with the key, field mask, retries, timeouts and errors handled.
     * The key goes in the X-Goog-Api-Key header, or in the query string with keyIn: 'query' for the older JSON APIs.
     */
    request: <T = unknown>(request: Request, call?: CallOptions) => send<T>(request, call),
  }
}

export type MapsClient = ReturnType<typeof createClient>

export { MapsError, type CallOptions, type ClientOptions, type FetchLike, type FieldOptions, type Request as MapsRequest } from './http'
export { placeFields, searchNearbyFields, searchTextFields, type PlaceSession, type Places } from './places'
export { matrixFields, routeFields, type Routes } from './routes'
export { newSessionToken, seconds, toLatLng, toWaypoint } from './util'
export type * from './types'
