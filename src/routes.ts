import type { FieldOptions, Send } from './http'
import type {
  ComputeRouteMatrixRequest,
  ComputeRoutesRequest,
  ComputeRoutesResponse,
  RouteMatrixDestination,
  RouteMatrixElement,
  RouteMatrixOrigin,
  WaypointInput,
} from './types'
import { toWaypoint } from './util'

// The Routes API refuses requests without a field mask
export const routeFields = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.staticDuration',
  'routes.polyline.encodedPolyline',
  'routes.localizedValues',
]
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

const isMatrixEntry = <T extends { waypoint: unknown }>(value: WaypointInput | T): value is T =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && 'waypoint' in value

const toOrigin = (value: WaypointInput | RouteMatrixOrigin): RouteMatrixOrigin =>
  isMatrixEntry(value) ? value : { waypoint: toWaypoint(value) }

const toDestination = (value: WaypointInput | RouteMatrixDestination): RouteMatrixDestination =>
  isMatrixEntry(value) ? value : { waypoint: toWaypoint(value) }

const has = (fields: string | string[], field: string) => (Array.isArray(fields) ? fields : fields.split(',')).includes(field)

export function createRoutes(send: Send) {
  const compute = (
    { origin, destination, intermediates, ...rest }: ComputeRoutesRequest,
    { fields = routeFields, ...call }: FieldOptions = {},
  ) =>
    send<ComputeRoutesResponse>(
      {
        method: 'POST',
        url: 'https://routes.googleapis.com/directions/v2:computeRoutes',
        body: {
          ...rest,
          origin: toWaypoint(origin),
          destination: toWaypoint(destination),
          ...(intermediates ? { intermediates: intermediates.map(toWaypoint) } : {}),
        },
        fields,
      },
      call,
    )

  /** Every origin-destination pair. Elements arrive in no particular order; use originIndex and destinationIndex. */
  const matrix = async (
    { origins, destinations, ...rest }: ComputeRouteMatrixRequest,
    { fields = matrixFields, ...call }: FieldOptions = {},
  ) => {
    const elements = await send<RouteMatrixElement[]>(
      {
        method: 'POST',
        url: 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
        body: { ...rest, origins: origins.map(toOrigin), destinations: destinations.map(toDestination) },
        fields,
      },
      call,
    )
    // JSON drops zero values, so index 0 arrives as a missing field
    return (elements ?? []).map((e) => ({
      ...e,
      ...(has(fields, 'originIndex') ? { originIndex: e.originIndex ?? 0 } : {}),
      ...(has(fields, 'destinationIndex') ? { destinationIndex: e.destinationIndex ?? 0 } : {}),
    }))
  }

  return { compute, matrix }
}

export type Routes = ReturnType<typeof createRoutes>
