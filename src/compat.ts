// Same API as @googlemaps/google-maps-services-js 3.x, running on Places API (New) and the Routes API.
// Switch by changing the import to "mapsfetch/compat".
import { createTransport, MapsError, type CallOptions, type FetchLike, type Send } from './http'
import { parseLocationBias, serializeParams, type LegacyLatLng } from './legacy/params'
import {
  autocompleteRequest,
  nearbyPlan,
  textSearchRequest,
  toFields,
  toLegacyPlace,
  toPrediction,
  type LegacyPlace,
  type PlaceAutocompleteParams,
  type PlaceAutocompleteResult,
  type PlacesNearbyParams,
  type TextSearchParams,
} from './legacy/places'
import {
  directionsFields,
  directionsPlan,
  matrixFields,
  matrixPlan,
  toLegacyMatrix,
  toLegacyRoute,
  type DirectionsParams,
  type DirectionsRoute,
  type DistanceMatrixElement,
  type DistanceMatrixParams,
} from './legacy/routes'
import { createPlaces } from './places'
import { createRoutes } from './routes'

export enum Status {
  OK = 'OK',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MAX_WAYPOINTS_EXCEEDED = 'MAX_WAYPOINTS_EXCEEDED',
  MAX_ROUTE_LENGTH_EXCEEDED = 'MAX_ROUTE_LENGTH_EXCEEDED',
  OVER_DAILY_LIMIT = 'OVER_DAILY_LIMIT',
  OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
  REQUEST_DENIED = 'REQUEST_DENIED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  ZERO_RESULTS = 'ZERO_RESULTS',
  NOT_FOUND = 'NOT_FOUND',
}

export enum TravelMode {
  driving = 'driving',
  walking = 'walking',
  bicycling = 'bicycling',
  transit = 'transit',
}

export enum TravelRestriction {
  tolls = 'tolls',
  highways = 'highways',
  ferries = 'ferries',
  indoor = 'indoor',
}

export enum UnitSystem {
  metric = 'metric',
  imperial = 'imperial',
}

export enum TrafficModel {
  best_guess = 'best_guess',
  optimistic = 'optimistic',
  pessimistic = 'pessimistic',
}

export enum TransitMode {
  bus = 'bus',
  subway = 'subway',
  train = 'train',
  tram = 'tram',
  rail = 'rail',
}

export enum PlaceAutocompleteType {
  geocode = 'geocode',
  address = 'address',
  establishment = 'establishment',
  regions = '(regions)',
  cities = '(cities)',
}

export enum PlaceInputType {
  textQuery = 'textquery',
  phoneNumber = 'phonenumber',
}

export enum PlacesNearbyRanking {
  prominence = 'prominence',
  distance = 'distance',
}

export interface ClientOptions {
  /** Defaults to the global fetch */
  fetch?: FetchLike
  /** timeout (ms), retries and extra headers. Other axios options are ignored. */
  config?: { timeout?: number; retries?: number; headers?: Record<string, string> }
  /** Ignored: there is no axios */
  axiosInstance?: unknown
  experienceId?: string[]
}

export interface ResponseData {
  status: Status | string
  error_message?: string
  html_attributions?: string[]
  next_page_token?: string
}

/** The fields of an axios response that callers read */
export interface Response<T> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
  config: Record<string, unknown>
}

export interface Request<P> {
  params: P & { key: string }
  /** Milliseconds */
  timeout?: number
  signal?: AbortSignal
}

/** Requests whose response body comes from Google unchanged */
type PassthroughRequest = Request<Record<string, unknown>>

const respond = <T>(data: T, status = 200): Response<T> => ({
  data,
  status,
  statusText: status === 200 ? 'OK' : '',
  headers: {},
  config: {},
})

// the new APIs' error statuses, as the legacy APIs reported them
const legacyStatuses: Record<string, Status> = {
  INVALID_ARGUMENT: Status.INVALID_REQUEST,
  FAILED_PRECONDITION: Status.INVALID_REQUEST,
  OUT_OF_RANGE: Status.INVALID_REQUEST,
  PERMISSION_DENIED: Status.REQUEST_DENIED,
  UNAUTHENTICATED: Status.REQUEST_DENIED,
  RESOURCE_EXHAUSTED: Status.OVER_QUERY_LIMIT,
  NOT_FOUND: Status.NOT_FOUND,
}

// legacy Place Details returned every field (and billed for all of them); default to the cheapest tier
const detailsFields = ['place_id', 'formatted_address', 'geometry', 'address_components']
const textSearchFields = ['place_id', 'name', 'formatted_address', 'geometry', 'types', 'business_status']
const nearbyFields = ['place_id', 'name', 'vicinity', 'geometry', 'types', 'business_status']

export class Client {
  private readonly options: ClientOptions
  private experienceId: string[]
  private readonly transports = new Map<string, Send>()

  constructor(options: ClientOptions = {}) {
    this.options = options
    this.experienceId = options.experienceId ?? []
  }

  setExperienceId(...ids: string[]) {
    this.experienceId = ids
  }

  clearExperienceId() {
    this.experienceId = []
  }

  getExperienceId() {
    return this.experienceId
  }

  private transport(key: string | undefined): Send {
    if (!key) throw new Error('mapsfetch/compat: params.key is required (client ID and URL signing are not supported)')
    const id = this.experienceId.join(',')
    const cacheKey = `${key}\n${id}`
    let send = this.transports.get(cacheKey)
    if (!send) {
      const { timeout, retries, headers } = this.options.config ?? {}
      send = createTransport({
        key,
        fetch: this.options.fetch,
        timeout,
        retries,
        headers: { ...headers, ...(id ? { 'X-GOOG-MAPS-EXPERIENCE-ID': id } : {}) },
      })
      this.transports.set(cacheKey, send)
    }
    return send
  }

  // Legacy web services answered errors with HTTP 200 and a status field, so callers check data.status.
  // API errors resolve the same way; network errors and timeouts still throw.
  private async call<T extends ResponseData>(
    request: Request<object>,
    empty: Omit<T, 'status'>,
    work: (send: Send, call: CallOptions) => Promise<T>,
  ): Promise<Response<T>> {
    const send = this.transport(request.params?.key)
    try {
      return respond(await work(send, { timeout: request.timeout, signal: request.signal }))
    } catch (e) {
      if (e instanceof MapsError && e.status > 0) {
        return respond({ ...empty, status: legacyStatuses[e.code] ?? Status.UNKNOWN_ERROR, error_message: e.message } as T, e.status)
      }
      throw e
    }
  }

  // APIs that aren't legacy (Geocoding, Elevation, Time Zone, Roads, Geolocation) are called as they are
  private async passthrough<T>(
    request: PassthroughRequest,
    url: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
  ): Promise<Response<T>> {
    const { key, ...params } = request.params ?? ({} as PassthroughRequest['params'])
    const send = this.transport(key)
    const data = await send<T>(
      { method, url, keyIn: 'query', query: serializeParams(params), body },
      { timeout: request.timeout, signal: request.signal },
    )
    return respond(data)
  }

  placeAutocomplete(request: Request<PlaceAutocompleteParams>) {
    return this.call<ResponseData & { predictions: PlaceAutocompleteResult[] }>(request, { predictions: [] }, async (send, call) => {
      const res = await createPlaces(send).autocomplete(autocompleteRequest(request.params), call)
      const predictions = (res.suggestions ?? []).flatMap((s) => (s.placePrediction ? [toPrediction(s.placePrediction)] : []))
      return { status: predictions.length ? Status.OK : Status.ZERO_RESULTS, predictions }
    })
  }

  placeQueryAutocomplete(request: Request<Omit<PlaceAutocompleteParams, 'types' | 'components' | 'strictbounds' | 'origin'>>) {
    return this.call<ResponseData & { predictions: PlaceAutocompleteResult[] }>(request, { predictions: [] }, async (send, call) => {
      const res = await createPlaces(send).autocomplete({ ...autocompleteRequest(request.params), includeQueryPredictions: true }, call)
      const predictions = (res.suggestions ?? []).flatMap((s) => {
        const p = s.placePrediction ?? s.queryPrediction
        return p ? [toPrediction(p)] : []
      })
      return { status: predictions.length ? Status.OK : Status.ZERO_RESULTS, predictions }
    })
  }

  placeDetails(request: Request<{ place_id: string; fields?: string[]; language?: string; region?: string; sessiontoken?: string }>) {
    return this.call<ResponseData & { result: LegacyPlace; html_attributions: string[] }>(
      request,
      { result: {}, html_attributions: [] },
      async (send, call) => {
        const { place_id, fields = detailsFields, language, region, sessiontoken } = request.params
        const place = await createPlaces(send).get(place_id, {
          ...call,
          fields: toFields(fields),
          languageCode: language,
          regionCode: region,
          sessionToken: sessiontoken,
        })
        return { status: Status.OK, result: toLegacyPlace(place), html_attributions: [] }
      },
    )
  }

  findPlaceFromText(
    request: Request<{ input: string; inputtype: PlaceInputType | string; fields?: string[]; locationbias?: string; language?: string }>,
  ) {
    return this.call<ResponseData & { candidates: LegacyPlace[] }>(request, { candidates: [] }, async (send, call) => {
      const { input, fields = ['place_id'], locationbias, language } = request.params
      const res = await createPlaces(send).searchText(
        { textQuery: input, languageCode: language, ...(locationbias ? { locationBias: parseLocationBias(locationbias) } : {}) },
        { ...call, fields: toFields(fields, 'places.') },
      )
      const candidates = (res.places ?? []).map(toLegacyPlace)
      return { status: candidates.length ? Status.OK : Status.ZERO_RESULTS, candidates }
    })
  }

  textSearch(request: Request<TextSearchParams>) {
    return this.call<ResponseData & { results: LegacyPlace[] }>(request, { results: [], html_attributions: [] }, async (send, call) => {
      const fields = [...toFields(request.params.fields ?? textSearchFields, 'places.'), 'nextPageToken']
      const res = await createPlaces(send).searchText(textSearchRequest(request.params), { ...call, fields })
      const results = (res.places ?? []).map(toLegacyPlace)
      return {
        status: results.length ? Status.OK : Status.ZERO_RESULTS,
        results,
        html_attributions: [],
        ...(res.nextPageToken ? { next_page_token: res.nextPageToken } : {}),
      }
    })
  }

  placesNearby(request: Request<PlacesNearbyParams>) {
    return this.call<ResponseData & { results: LegacyPlace[] }>(request, { results: [], html_attributions: [] }, async (send, call) => {
      const plan = nearbyPlan(request.params)
      const fields = toFields(request.params.fields ?? nearbyFields, 'places.')
      const places = createPlaces(send)
      const res =
        plan.kind === 'nearby'
          ? await places.searchNearby(plan.request, { ...call, fields })
          : await places.searchText(plan.request, { ...call, fields: [...fields, 'nextPageToken'] })
      const results = (res.places ?? []).map(toLegacyPlace)
      const token = 'nextPageToken' in res ? (res.nextPageToken as string | undefined) : undefined
      return {
        status: results.length ? Status.OK : Status.ZERO_RESULTS,
        results,
        html_attributions: [],
        ...(token ? { next_page_token: token } : {}),
      }
    })
  }

  /**
   * Image bytes for a photo. photoreference is a photo name from a result's photos (places/.../photos/...).
   * Returns an ArrayBuffer, as the legacy client did by default.
   */
  async placePhoto(request: Request<{ photoreference: string; maxwidth?: number; maxheight?: number }>): Promise<Response<ArrayBuffer>> {
    const { photoreference, maxwidth, maxheight, key } = request.params
    if (!photoreference.startsWith('places/')) {
      throw new Error(
        'mapsfetch/compat: photoreference must be a Places API (New) photo name ("places/.../photos/..."), as returned in photos[]',
      )
    }
    const send = this.transport(key)
    const call = { timeout: request.timeout, signal: request.signal }
    const { photoUri } = await createPlaces(send).photo(photoreference, { ...call, maxWidthPx: maxwidth, maxHeightPx: maxheight })
    const res = await (this.options.fetch ?? globalThis.fetch)(photoUri, { signal: request.signal })
    if (!res.ok) throw new MapsError(`mapsfetch/compat: photo download failed with HTTP ${res.status}`, res.status, 'UNKNOWN')
    const contentType = res.headers.get('content-type')
    return { ...respond(await res.arrayBuffer()), headers: contentType ? { 'content-type': contentType } : {} }
  }

  directions(request: Request<DirectionsParams>) {
    return this.call<ResponseData & { routes: DirectionsRoute[]; geocoded_waypoints: unknown[]; available_travel_modes: string[] }>(
      request,
      { routes: [], geocoded_waypoints: [], available_travel_modes: [] },
      async (send, call) => {
        const plan = directionsPlan(request.params)
        const res = await createRoutes(send).compute(plan.request, { ...call, fields: directionsFields })
        const routes = (res.routes ?? []).map((r) => toLegacyRoute(r, plan))
        return { status: routes.length ? Status.OK : Status.ZERO_RESULTS, routes, geocoded_waypoints: [], available_travel_modes: [] }
      },
    )
  }

  distancematrix(request: Request<DistanceMatrixParams>) {
    return this.call<
      ResponseData & { origin_addresses: string[]; destination_addresses: string[]; rows: { elements: DistanceMatrixElement[] }[] }
    >(request, { origin_addresses: [], destination_addresses: [], rows: [] }, async (send, call) => {
      const { request: body, trafficAware } = matrixPlan(request.params)
      const elements = await createRoutes(send).matrix(body, { ...call, fields: matrixFields })
      return { status: Status.OK, ...toLegacyMatrix(elements, request.params, trafficAware) }
    })
  }

  geocode(request: PassthroughRequest) {
    return this.passthrough<ResponseData & { results: unknown[] }>(request, 'https://maps.googleapis.com/maps/api/geocode/json')
  }

  reverseGeocode(request: PassthroughRequest) {
    return this.passthrough<ResponseData & { results: unknown[] }>(request, 'https://maps.googleapis.com/maps/api/geocode/json')
  }

  elevation(request: PassthroughRequest) {
    return this.passthrough<ResponseData & { results: unknown[] }>(request, 'https://maps.googleapis.com/maps/api/elevation/json')
  }

  timezone(request: PassthroughRequest) {
    return this.passthrough<ResponseData & Record<string, unknown>>(request, 'https://maps.googleapis.com/maps/api/timezone/json')
  }

  geolocate(request: PassthroughRequest & { data?: unknown }) {
    return this.passthrough<Record<string, unknown>>(
      request,
      'https://www.googleapis.com/geolocation/v1/geolocate',
      'POST',
      request.data ?? {},
    )
  }

  nearestRoads(request: PassthroughRequest) {
    return this.passthrough<Record<string, unknown>>(request, 'https://roads.googleapis.com/v1/nearestRoads')
  }

  snapToRoads(request: PassthroughRequest) {
    return this.passthrough<Record<string, unknown>>(request, 'https://roads.googleapis.com/v1/snapToRoads')
  }
}

export { MapsError }
export type { LegacyLatLng as LatLng }
export type { LatLngBounds, LatLngLiteral } from './legacy/params'
export type { LegacyPlace as Place, PlaceAutocompleteResult } from './legacy/places'
export type { DirectionsRoute, DistanceMatrixElement, RouteLeg, DirectionsStep, Distance, Duration } from './legacy/routes'
