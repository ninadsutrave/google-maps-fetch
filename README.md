# mapsfetch

[![npm](https://img.shields.io/npm/v/mapsfetch)](https://www.npmjs.com/package/mapsfetch)
[![ci](https://github.com/ninadsutrave/mapsfetch/actions/workflows/ci.yml/badge.svg)](https://github.com/ninadsutrave/mapsfetch/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mapsfetch)](LICENSE)

A small client for Google Maps Platform's current APIs (Places API (New), Routes API and Geocoding) built on `fetch`. It has no dependencies and runs on Node, Bun, Deno, Cloudflare Workers and Vercel Edge.

It also ships `mapsfetch/compat`, a replacement for `@googlemaps/google-maps-services-js` with the same methods and response shapes. Existing code can move to the new APIs by changing one import.

```ts
import { createClient } from 'mapsfetch'

const maps = createClient({ key: process.env.GOOGLE_MAPS_KEY! })

const { suggestions } = await maps.places.autocomplete({ input: 'Shaniwar Wada', includedRegionCodes: ['in'] })
const { routes } = await maps.routes.compute({ origin: 'Pune', destination: 'Mumbai' })
```

## Why

- **The legacy APIs are closed to new projects.** Since October 2026, Places API (Legacy), Directions API (Legacy) and Distance Matrix API (Legacy) can no longer be enabled on new Google Cloud projects. `@googlemaps/google-maps-services-js` calls those APIs, so it doesn't work for a new project.
- **Google's replacements are heavy.** The official clients for the new APIs (`@googlemaps/places`, `@googlemaps/routing`) are built on gRPC. Installing those two adds 37 MB to `node_modules`. mapsfetch is about 3.5 kB gzipped, and the compat layer about 12 kB.
- **It runs where your code runs.** It only needs `fetch`, `AbortController` and `crypto.randomUUID`. CI checks Node 20, 22 and 24. Before release, the same build was run in Bun, Deno, Cloudflare's `workerd` and Vercel's Edge Runtime.

## Install

```sh
npm install mapsfetch
```

Enable the APIs you use on your Google Cloud project (**Places API (New)**, **Routes API**, **Geocoding API**). If your key has API restrictions, add them there too.

## Usage

### Places

```ts
// autocomplete and details in one billed session
const session = maps.places.session()
const { suggestions = [] } = await session.autocomplete({ input: 'Vaishali FC Road' })
const place = await session.get(suggestions[0].placePrediction!.placeId) // ends the session

place.formattedAddress // "1218/1, FC Road, ..."
place.location // { latitude: 18.52, longitude: 73.84 }

// more fields cost more; ask for what you need
await maps.places.get(placeId, { fields: ['displayName', 'rating', 'regularOpeningHours'] })

await maps.places.searchText({ textQuery: 'misal in Pune', pageSize: 10 })
await maps.places.searchNearby({
  locationRestriction: { circle: { center: { latitude: 18.52, longitude: 73.85 }, radius: 800 } },
  includedTypes: ['cafe'],
})

// a short-lived URL for a photo name from place.photos
const { photoUri } = await maps.places.photo(place.photos![0].name, { maxWidthPx: 600 })
```

### Routes

Waypoints can be an address string, coordinates (`{ lat, lng }`, `{ latitude, longitude }` or `[lat, lng]`) or a full `Waypoint`.

```ts
const { routes = [] } = await maps.routes.compute({
  origin: 'Pune Railway Station',
  destination: { lat: 19.076, lng: 72.8777 },
  travelMode: 'DRIVE',
})
routes[0].distanceMeters // 148000
seconds(routes[0].duration) // 10800

// every origin to every destination; match results by index
const elements = await maps.routes.matrix({
  origins: ['Pune', 'Nashik'],
  destinations: ['Mumbai', [18.5204, 73.8567]],
})
for (const e of elements) console.log(e.originIndex, e.destinationIndex, e.distanceMeters)
```

### Geocoding

```ts
const [result] = await maps.geocode({ address: 'FC Road, Pune', components: { country: 'IN' } })
const nearby = await maps.reverseGeocode({ location: { lat: 18.52, lng: 73.84 } })
```

## Field masks and billing

Google bills Place Details and searches by the most expensive field you ask for, and the Places and Routes APIs need a field mask for most calls. mapsfetch defaults to the cheapest useful mask. Pass `fields` to change it.

| Call                  | Default fields                                                   | Billing tier                                                                                 |
| :-------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| `places.get`          | `id, formattedAddress, location`                                 | Essentials                                                                                   |
| `places.searchText`   | `places.id, displayName, formattedAddress, location`, page token | Pro                                                                                          |
| `places.searchNearby` | `places.id, displayName, formattedAddress, location, types`      | Pro                                                                                          |
| `places.autocomplete` | everything (no mask)                                             | Session-based ([see Google](https://developers.google.com/maps/billing-and-pricing/pricing)) |
| `routes.compute`      | distance, duration, polyline, localized text                     | Set by the request (traffic, waypoints), not the fields                                      |
| `routes.matrix`       | indexes, status, condition, distance, durations, localized text  | Set by the request                                                                           |

Use `places.session()` for autocomplete. It sends one session token with every keystroke and with the details call that ends the session, so Google bills them as one session rather than one request at a time ([session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing)).

## Options

```ts
createClient({
  key: '...', // required
  fetch, // default: globalThis.fetch
  timeout: 10_000, // ms per attempt
  retries: 2, // extra attempts after a network error, timeout, 429 or 5xx
  headers: {}, // sent with every request
})
```

Every method also takes `{ signal, timeout }`, and the field-masked ones take `fields`. Cancelling through `signal` is never retried.

## Errors

Failures throw a `MapsError`:

```ts
import { MapsError } from 'mapsfetch'

try {
  await maps.places.get('not-a-place')
} catch (e) {
  if (e instanceof MapsError) {
    e.status // HTTP status, or 0 if there was no response
    e.code // e.g. INVALID_ARGUMENT, PERMISSION_DENIED, RESOURCE_EXHAUSTED, TIMEOUT, NETWORK_ERROR
    e.body // Google's error body
  }
}
```

## Migrating from @googlemaps/google-maps-services-js

Change the import:

```diff
- import { Client, TravelMode } from '@googlemaps/google-maps-services-js'
+ import { Client, TravelMode } from 'mapsfetch/compat'

  const client = new Client({})
  const { data } = await client.directions({
    params: { origin: 'Pune', destination: 'Mumbai', mode: TravelMode.driving, key },
  })
```

Requests take the same `params` and return `{ data, status, statusText, headers, config }`, with `data` in the legacy shape. Enable **Places API (New)** and **Routes API** on your project first.

| Method                                                                                           | Now calls                                                                             |
| :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ |
| `placeAutocomplete`, `placeQueryAutocomplete`                                                    | Places API (New) Autocomplete                                                         |
| `placeDetails`                                                                                   | Places API (New) Place Details                                                        |
| `findPlaceFromText`, `textSearch`                                                                | Places API (New) Text Search                                                          |
| `placesNearby`                                                                                   | Nearby Search (New), or Text Search when you use keyword/name/price/opennow/pagetoken |
| `placePhoto`                                                                                     | Places API (New) photo media                                                          |
| `directions`                                                                                     | Routes API `computeRoutes`                                                            |
| `distancematrix`                                                                                 | Routes API `computeRouteMatrix`                                                       |
| `geocode`, `reverseGeocode`, `elevation`, `timezone`, `geolocate`, `nearestRoads`, `snapToRoads` | The same APIs as before (they aren't legacy), unchanged                               |

### What's different

- **Errors.** API errors resolve with a legacy status in `data.status` (`REQUEST_DENIED`, `INVALID_REQUEST`, `OVER_QUERY_LIMIT`, `NOT_FOUND`, `UNKNOWN_ERROR`) and `data.error_message`, which is how the legacy APIs reported them. Network errors and timeouts throw.
- **`placeDetails` without `fields`.** The legacy API returned every field and billed for all of them. This defaults to `place_id, formatted_address, geometry, address_components` (Essentials). Pass `fields` for anything else; legacy field names are mapped.
- **Addresses in routes.** The Routes API doesn't geocode inputs back to addresses. `start_address`, `end_address`, `origin_addresses` and `destination_addresses` repeat what you passed: the address string, `"lat,lng"` for coordinates, or `""` for a place ID. `geocoded_waypoints` is empty.
- **Autocomplete `types`.** `(cities)` and `(regions)` work as before, and `address` becomes street-level types. `geocode` and `establishment` have no equivalent in the new API, so no type filter is applied.
- **`placesNearby` with keyword, name, price, open-now or a page token** runs a Text Search inside the circle, because Nearby Search (New) has none of those. That's a different billing SKU.
- **Photos.** `photo_reference` in results is now a photo name (`places/.../photos/...`). `placePhoto` accepts those and returns an `ArrayBuffer`. Old-style references don't work.
- **Not supported:** `client_id` / URL signing, `enc:` polyline waypoints, and axios options other than `timeout`. Pass `config: { timeout, retries, headers }` to the constructor.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The tests use a fake `fetch`, so they don't need a Google key.

## License

[MIT](LICENSE)
