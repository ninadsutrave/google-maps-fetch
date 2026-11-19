// Legacy Directions and Distance Matrix requests and responses, mapped to and from the Routes API
import type { ComputeRouteMatrixRequest, ComputeRoutesRequest, Route, RouteMatrixElement } from '../types'
import { seconds } from '../util'
import { addressOf, strip, toLiteral, toWaypoint, type LatLngBounds, type LatLngLiteral, type LegacyLatLng } from './params'

interface CommonParams {
  /** driving (default), walking, bicycling or transit */
  mode?: string
  avoid?: string[]
  language?: string
  region?: string
  /** metric or imperial */
  units?: string
  arrival_time?: Date | number
  departure_time?: Date | number | 'now'
  /** best_guess, pessimistic or optimistic */
  traffic_model?: string
  /** bus, subway, train, tram, rail */
  transit_mode?: string[]
  /** less_walking or fewer_transfers */
  transit_routing_preference?: string
}

export interface DirectionsParams extends CommonParams {
  origin: LegacyLatLng
  destination: LegacyLatLng
  waypoints?: LegacyLatLng[]
  alternatives?: boolean
  optimize?: boolean
}

export interface DistanceMatrixParams extends CommonParams {
  origins: LegacyLatLng[]
  destinations: LegacyLatLng[]
}

const modes: Record<string, string> = { driving: 'DRIVE', walking: 'WALK', bicycling: 'BICYCLE', transit: 'TRANSIT' }
const legacyModes: Record<string, string> = { DRIVE: 'DRIVING', WALK: 'WALKING', BICYCLE: 'BICYCLING', TRANSIT: 'TRANSIT' }
const transitModes: Record<string, string> = { bus: 'BUS', subway: 'SUBWAY', train: 'TRAIN', tram: 'LIGHT_RAIL', rail: 'RAIL' }

// seconds since the epoch, or a Date, to RFC 3339
const timestamp = (t: Date | number) => new Date(typeof t === 'number' ? t * 1000 : t).toISOString()

// Pick, not Omit: Omit on a type with an index signature drops the named fields
type Options = Pick<
  ComputeRoutesRequest,
  | 'travelMode'
  | 'routingPreference'
  | 'departureTime'
  | 'arrivalTime'
  | 'trafficModel'
  | 'transitPreferences'
  | 'routeModifiers'
  | 'languageCode'
  | 'regionCode'
  | 'units'
>

/** Options shared by directions and the matrix, and whether the result includes traffic */
const routeOptions = (p: CommonParams): { options: Options; trafficAware: boolean } => {
  const travelMode = modes[p.mode ?? 'driving'] ?? p.mode!.toUpperCase()
  const options: Options = { travelMode }
  let trafficAware = false
  // the legacy API used traffic whenever a driving request had a departure time
  if (travelMode === 'DRIVE' && p.departure_time !== undefined) {
    trafficAware = true
    options.routingPreference = p.traffic_model ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE'
    if (p.departure_time !== 'now') options.departureTime = timestamp(p.departure_time)
    if (p.traffic_model) options.trafficModel = p.traffic_model.toUpperCase()
  }
  if (travelMode === 'TRANSIT') {
    if (p.departure_time !== undefined && p.departure_time !== 'now') options.departureTime = timestamp(p.departure_time)
    if (p.arrival_time !== undefined) options.arrivalTime = timestamp(p.arrival_time)
    const preferences = strip({
      allowedTravelModes: p.transit_mode?.map((m) => transitModes[m] ?? m.toUpperCase()),
      routingPreference: p.transit_routing_preference?.toUpperCase(),
    })
    if (Object.keys(preferences).length) options.transitPreferences = preferences
  }
  if (p.avoid?.length) {
    options.routeModifiers = strip({
      avoidTolls: p.avoid.includes('tolls') || undefined,
      avoidHighways: p.avoid.includes('highways') || undefined,
      avoidFerries: p.avoid.includes('ferries') || undefined,
      avoidIndoor: p.avoid.includes('indoor') || undefined,
    })
  }
  // the legacy APIs answered in English by default; the Routes API instead guesses from the origin
  // (it returned Assamese for Pune), so keep English unless asked otherwise
  options.languageCode = p.language ?? 'en'
  if (p.region) options.regionCode = p.region
  if (p.units) options.units = p.units.toUpperCase()
  return { options, trafficAware }
}

export interface Distance {
  value: number
  text: string
}

export type Duration = Distance

const distance = (metres: number | undefined, text: string | undefined): Distance => ({
  value: metres ?? 0,
  text: text ?? `${((metres ?? 0) / 1000).toFixed(1)} km`,
})

const duration = (d: string | undefined, text: string | undefined): Duration => {
  const value = Math.round(seconds(d) ?? 0)
  const minutes = Math.max(1, Math.round(value / 60))
  return { value, text: text ?? (minutes === 1 ? '1 min' : `${minutes} mins`) }
}

// TURN_SLIGHT_LEFT -> turn-slight-left; the names otherwise match the legacy ones
const maneuver = (m: string | undefined) =>
  !m || m === 'DEPART' || m === 'NAME_CHANGE' || m === 'MANEUVER_UNSPECIFIED' ? undefined : m.toLowerCase().replace(/_/g, '-')

// ---------- directions ----------

export const directionsFields = [
  'routes.description',
  'routes.warnings',
  'routes.viewport',
  'routes.polyline.encodedPolyline',
  'routes.optimizedIntermediateWaypointIndex',
  'routes.legs.distanceMeters',
  'routes.legs.duration',
  'routes.legs.staticDuration',
  'routes.legs.startLocation',
  'routes.legs.endLocation',
  'routes.legs.localizedValues',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.polyline.encodedPolyline',
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.localizedValues',
  'routes.legs.steps.travelMode',
]

export interface DirectionsPlan {
  request: ComputeRoutesRequest
  trafficAware: boolean
  /** Waypoints that start or end a leg (via points don't), for leg addresses */
  stops: LegacyLatLng[]
  intermediates: number
}

export const directionsPlan = (p: DirectionsParams): DirectionsPlan => {
  let waypoints = p.waypoints ?? []
  let optimize = p.optimize
  if (waypoints[0] === 'optimize:true') {
    optimize = true
    waypoints = waypoints.slice(1)
  }
  const { options, trafficAware } = routeOptions(p)
  const request: ComputeRoutesRequest = strip({
    ...options,
    origin: toWaypoint(p.origin),
    destination: toWaypoint(p.destination),
    intermediates: waypoints.length ? waypoints.map(toWaypoint) : undefined,
    computeAlternativeRoutes: p.alternatives || undefined,
    optimizeWaypointOrder: optimize || undefined,
  })
  const legStops = waypoints.filter((w) => !(typeof w === 'string' && w.startsWith('via:')))
  return { request, trafficAware, stops: [p.origin, ...legStops, p.destination], intermediates: legStops.length }
}

export interface DirectionsStep {
  html_instructions: string
  distance: Distance
  duration: Duration
  start_location: LatLngLiteral
  end_location: LatLngLiteral
  polyline: { points: string }
  travel_mode: string
  maneuver?: string
}

export interface RouteLeg {
  steps: DirectionsStep[]
  distance: Distance
  duration: Duration
  duration_in_traffic?: Duration
  start_location: LatLngLiteral
  end_location: LatLngLiteral
  start_address: string
  end_address: string
}

export interface DirectionsRoute {
  summary: string
  legs: RouteLeg[]
  waypoint_order: number[]
  overview_polyline: { points: string }
  bounds?: LatLngBounds
  copyrights: string
  warnings: string[]
}

export const toLegacyRoute = (r: Route, plan: DirectionsPlan): DirectionsRoute => {
  const order = (r.optimizedIntermediateWaypointIndex ?? []).filter((i) => i >= 0)
  const optimized = order.length === plan.intermediates
  // with an optimized order, legs follow the new order
  const stops = optimized ? [plan.stops[0], ...order.map((i) => plan.stops[i + 1]), plan.stops[plan.stops.length - 1]] : plan.stops
  return strip({
    summary: r.description ?? '',
    legs: (r.legs ?? []).map((leg, i) =>
      strip({
        steps: (leg.steps ?? []).map((s) =>
          strip({
            html_instructions: s.navigationInstruction?.instructions ?? '',
            distance: distance(s.distanceMeters, s.localizedValues?.distance?.text),
            duration: duration(s.staticDuration, s.localizedValues?.staticDuration?.text),
            start_location: toLiteral(s.startLocation?.latLng),
            end_location: toLiteral(s.endLocation?.latLng),
            polyline: { points: s.polyline?.encodedPolyline ?? '' },
            travel_mode: (s.travelMode && legacyModes[s.travelMode]) ?? s.travelMode ?? '',
            maneuver: maneuver(s.navigationInstruction?.maneuver),
          }),
        ),
        distance: distance(leg.distanceMeters, leg.localizedValues?.distance?.text),
        // legacy duration never included traffic; staticDuration is the same thing
        duration: leg.staticDuration
          ? duration(leg.staticDuration, leg.localizedValues?.staticDuration?.text)
          : duration(leg.duration, leg.localizedValues?.duration?.text),
        duration_in_traffic: plan.trafficAware ? duration(leg.duration, leg.localizedValues?.duration?.text) : undefined,
        start_location: toLiteral(leg.startLocation?.latLng),
        end_location: toLiteral(leg.endLocation?.latLng),
        start_address: addressOf(stops[i]),
        end_address: addressOf(stops[i + 1]),
      }),
    ),
    waypoint_order: optimized ? order : Array.from({ length: plan.intermediates }, (_, i) => i),
    overview_polyline: { points: r.polyline?.encodedPolyline ?? '' },
    bounds: r.viewport ? { northeast: toLiteral(r.viewport.high), southwest: toLiteral(r.viewport.low) } : undefined,
    copyrights: `Map data ©${new Date().getFullYear()} Google`,
    warnings: r.warnings ?? [],
  })
}

// ---------- distance matrix ----------

export const matrixFields = [
  'originIndex',
  'destinationIndex',
  'status',
  'condition',
  'distanceMeters',
  'duration',
  'staticDuration',
  'localizedValues',
]

export const matrixPlan = (p: DistanceMatrixParams): { request: ComputeRouteMatrixRequest; trafficAware: boolean } => {
  const { options, trafficAware } = routeOptions(p)
  // the matrix takes route modifiers per origin
  const { routeModifiers, ...rest } = options
  return {
    request: {
      ...rest,
      origins: p.origins.map((o) => ({ waypoint: toWaypoint(o), ...(routeModifiers ? { routeModifiers } : {}) })),
      destinations: p.destinations.map((d) => ({ waypoint: toWaypoint(d) })),
    },
    trafficAware,
  }
}

export interface DistanceMatrixElement {
  status: string
  distance?: Distance
  duration?: Duration
  duration_in_traffic?: Duration
}

const toElement = (e: RouteMatrixElement, trafficAware: boolean): DistanceMatrixElement => {
  if (e.status?.code) return { status: 'NOT_FOUND' }
  if (e.condition === 'ROUTE_NOT_FOUND') return { status: 'ZERO_RESULTS' }
  return strip({
    status: 'OK',
    distance: distance(e.distanceMeters, e.localizedValues?.distance?.text),
    duration: e.staticDuration
      ? duration(e.staticDuration, e.localizedValues?.staticDuration?.text)
      : duration(e.duration, e.localizedValues?.duration?.text),
    duration_in_traffic: trafficAware ? duration(e.duration, e.localizedValues?.duration?.text) : undefined,
  })
}

export const toLegacyMatrix = (elements: RouteMatrixElement[], p: DistanceMatrixParams, trafficAware: boolean) => {
  const rows = p.origins.map(() => ({ elements: p.destinations.map((): DistanceMatrixElement => ({ status: 'NOT_FOUND' })) }))
  for (const e of elements) {
    const row = rows[e.originIndex]
    if (row && e.destinationIndex < row.elements.length) row.elements[e.destinationIndex] = toElement(e, trafficAware)
  }
  return { origin_addresses: p.origins.map(addressOf), destination_addresses: p.destinations.map(addressOf), rows }
}
