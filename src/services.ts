// APIs that weren't legacy in @googlemaps/google-maps-services-js: Elevation, Time Zone, Geolocation and Roads
import { checkStatus, point, points, type ClassicBody } from './classic'
import type { CallOptions, Send } from './http'
import type {
  ElevationRequest,
  ElevationResult,
  GeolocateRequest,
  GeolocateResponse,
  NearestRoadsRequest,
  SnappedPoint,
  SnapToRoadsRequest,
  TimeZone,
  TimeZoneRequest,
} from './types'

const seconds = (t: Date | number) => (typeof t === 'number' ? Math.floor(t) : Math.floor(t.getTime() / 1000))

export function createServices(send: Send) {
  /** Height above sea level for a list of points, or for samples along a path */
  const elevation = async (request: ElevationRequest, call?: CallOptions): Promise<ElevationResult[]> => {
    const query =
      'locations' in request ? { locations: points(request.locations) } : { path: points(request.path), samples: request.samples }
    const body = await send<ClassicBody & { results?: ElevationResult[] }>(
      { method: 'GET', url: 'https://maps.googleapis.com/maps/api/elevation/json', keyIn: 'query', query },
      call,
    )
    return checkStatus(body, 'Elevation')?.results ?? []
  }

  /** The time zone at a point. Undefined where there is none, such as open sea. */
  const timezone = async (
    { location, timestamp = new Date(), language }: TimeZoneRequest,
    call?: CallOptions,
  ): Promise<TimeZone | undefined> => {
    const body = await send<ClassicBody & TimeZone>(
      {
        method: 'GET',
        url: 'https://maps.googleapis.com/maps/api/timezone/json',
        keyIn: 'query',
        query: { location: point(location), timestamp: seconds(timestamp), language },
      },
      call,
    )
    const zone = checkStatus(body, 'Time Zone')
    return zone && { dstOffset: zone.dstOffset, rawOffset: zone.rawOffset, timeZoneId: zone.timeZoneId, timeZoneName: zone.timeZoneName }
  }

  /** A location from cell towers and Wi-Fi access points. A 404 (NOT_FOUND) means Google couldn't place it. */
  const geolocate = (request: GeolocateRequest = {}, call?: CallOptions) =>
    send<GeolocateResponse>({ method: 'POST', url: 'https://www.googleapis.com/geolocation/v1/geolocate', body: request }, call)

  const roads = {
    /** Snaps a GPS trace to the roads it most likely followed */
    snap: async ({ path, interpolate }: SnapToRoadsRequest, call?: CallOptions) =>
      (
        await send<{ snappedPoints?: SnappedPoint[]; warningMessage?: string }>(
          { method: 'GET', url: 'https://roads.googleapis.com/v1/snapToRoads', query: { path: points(path), interpolate } },
          call,
        )
      ).snappedPoints ?? [],
    /** The nearest road segment for each point, independently */
    nearest: async ({ points: list }: NearestRoadsRequest, call?: CallOptions) =>
      (
        await send<{ snappedPoints?: SnappedPoint[] }>(
          { method: 'GET', url: 'https://roads.googleapis.com/v1/nearestRoads', query: { points: points(list) } },
          call,
        )
      ).snappedPoints ?? [],
  }

  return { elevation, timezone, geolocate, roads }
}
