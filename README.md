# google-maps-fetch

[![npm](https://img.shields.io/npm/v/google-maps-fetch)](https://www.npmjs.com/package/google-maps-fetch)
[![ci](https://github.com/ninadsutrave/google-maps-fetch/actions/workflows/ci.yml/badge.svg)](https://github.com/ninadsutrave/google-maps-fetch/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/google-maps-fetch)](LICENSE)

A small client for Google Maps Platform's web APIs, built on `fetch`: Places API (New), Routes, Geocoding, Address Validation, Elevation, Time Zone, Geolocation and Roads, plus a `request()` for any other Maps REST API. It has no dependencies and runs on Node, Bun, Deno, Cloudflare Workers and Vercel Edge.

It also ships `google-maps-fetch/compat`, a replacement for `@googlemaps/google-maps-services-js` with the same methods and response shapes. Existing code can move to the new APIs by changing one import.

Building a search box in React? [google-places-autocomplete-hook](https://github.com/ninadsutrave/google-places-autocomplete-hook) is the browser-side companion: a hook for Places autocomplete on the same new API.

```ts
import { createClient } from 'google-maps-fetch'

const maps = createClient({ key: process.env.GOOGLE_MAPS_KEY! })

const { suggestions } = await maps.places.autocomplete({ input: 'Shaniwar Wada', includedRegionCodes: ['in'] })
const { routes } = await maps.routes.compute({ origin: 'Pune', destination: 'Mumbai' })
```

## Why

- **The legacy APIs are closed to new projects.** Since October 2026, Places API (Legacy), Directions API (Legacy) and Distance Matrix API (Legacy) can no longer be enabled on new Google Cloud projects. `@googlemaps/google-maps-services-js` calls those APIs, so it doesn't work for a new project.
- **Google's replacements are heavy.** The official clients for the new APIs (`@googlemaps/places`, `@googlemaps/routing`) are built on gRPC. Installing those two adds 37 MB to `node_modules`. `google-maps-fetch` is about 4.4 kB gzipped, and the compat layer about 12 kB.
- **It runs where your code runs.** It only needs `fetch`, `AbortController` and `crypto.randomUUID`. It's tested on Node 20, 22, 24 and 26. Before release, the same build was run in Bun, Deno, Cloudflare's `workerd` and Vercel's Edge Runtime.

## Install

```sh
npm install google-maps-fetch
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
  languageCode: 'en',
})
routes[0].distanceMeters // e.g. 151000
seconds(routes[0].duration) // e.g. 10800
routes[0].localizedValues?.distance?.text // "151 km"

// every origin to every destination; match results by index
const elements = await maps.routes.matrix({
  origins: ['Pune', 'Nashik'],
  destinations: ['Mumbai', [18.5204, 73.8567]],
})
for (const e of elements) console.log(e.originIndex, e.destinationIndex, e.distanceMeters)
```

Pass `languageCode` when you show `localizedValues` text. Without it, the Routes API picks a language from the origin: for a route from Pune it answered in Assamese script ("১৫১ কিল’মিটাৰ").

### Geocoding

```ts
const [result] = await maps.geocode({ address: 'FC Road, Pune', components: { country: 'IN' } })
const nearby = await maps.reverseGeocode({ location: { lat: 18.52, lng: 73.84 } })
```

### Address Validation

```ts
const { result, responseId } = await maps.addressValidation.validate({
  address: { regionCode: 'IN', addressLines: ['Shaniwar Wada, Shaniwar Peth', 'Pune 411030'] },
})
result.verdict.possibleNextAction // "ACCEPT", "CONFIRM", "FIX", ...
result.address.formattedAddress
result.geocode?.location

// optional: tell Google which version you used
await maps.addressValidation.feedback({ responseId, conclusion: 'VALIDATED_VERSION_USED' })
```

### Elevation, Time Zone, Geolocation and Roads

```ts
await maps.elevation({ locations: [[18.52, 73.85]] }) // [{ elevation: 560, location, resolution }]
await maps.elevation({ path: [pune, mumbai], samples: 20 })

await maps.timezone({ location: [18.52, 73.85] }) // { timeZoneId: 'Asia/Calcutta', rawOffset: 19800, ... }

await maps.geolocate({ considerIp: false, wifiAccessPoints }) // { location: { lat, lng }, accuracy }

await maps.roads.snap({ path: gpsTrace, interpolate: true }) // [{ location, originalIndex, placeId }]
await maps.roads.nearest({ points: [[18.52, 73.85]] })
```

### Any other Maps API

`request()` sends any Google Maps Platform REST call with the same key handling, field masks, retries, timeouts and errors:

```ts
const forecast = await maps.request<{ dailyInfo: unknown[] }>({
  method: 'POST',
  url: 'https://pollen.googleapis.com/v1/forecast:lookup',
  body: { location: { latitude: 18.52, longitude: 73.85 }, days: 3 },
})

// older JSON APIs take the key in the query string
await maps.request({
  method: 'GET',
  url: 'https://maps.googleapis.com/maps/api/streetview/metadata',
  query: { location: '18.52,73.85' },
  keyIn: 'query',
})
```

### What's covered

| API                                                                          | Methods                                                                        |
| :--------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| Places API (New)                                                             | `places.autocomplete`, `get`, `searchText`, `searchNearby`, `photo`, `session` |
| Routes API                                                                   | `routes.compute`, `routes.matrix`                                              |
| Geocoding API                                                                | `geocode`, `reverseGeocode`                                                    |
| Address Validation API                                                       | `addressValidation.validate`, `feedback`                                       |
| Elevation API                                                                | `elevation`                                                                    |
| Time Zone API                                                                | `timezone`                                                                     |
| Geolocation API                                                              | `geolocate`                                                                    |
| Roads API                                                                    | `roads.snap`, `roads.nearest`                                                  |
| Anything else (Route Optimization, Solar, Air Quality, Pollen, Weather, ...) | `request`                                                                      |

Typed methods are added when people ask for them; open an issue if you'd like one.

## Field masks and billing

Google bills Place Details and searches by the most expensive field you ask for, and the Places and Routes APIs need a field mask for most calls. `google-maps-fetch` defaults to the cheapest useful mask. Pass `fields` to change it.

| Call                  | Default fields                                                   | Billing tier                                                                                 |
| :-------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| `places.get`          | `id, formattedAddress, location`                                 | Essentials                                                                                   |
| `places.searchText`   | `places.id, displayName, formattedAddress, location`, page token | Pro                                                                                          |
| `places.searchNearby` | `places.id, displayName, formattedAddress, location, types`      | Pro                                                                                          |
| `places.autocomplete` | everything (no mask)                                             | Session-based ([see Google](https://developers.google.com/maps/billing-and-pricing/pricing)) |
| `routes.compute`      | distance, duration, polyline, localized text                     | Set by the request (traffic, waypoints), not the fields                                      |
| `routes.matrix`       | indexes, status, condition, distance, durations, localized text  | Set by the request                                                                           |

Use `places.session()` for autocomplete. It sends one session token with every keystroke and with the details call that ends the session. What Google then charges depends on the fields that details call asks for ([session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing)):

- **Essentials fields only** (the `get` default): the first 12 autocomplete requests in the session are billed per request, any beyond that are free, and the details call is billed at Essentials.
- **Any Pro or Enterprise field** (`displayName`, `rating`, phone numbers, ...): every autocomplete request is free, and the details call is billed at Enterprise + Atmosphere, whatever else you asked for.
- **`fields: ['id']` only, or no details call**: every autocomplete request is billed per request.

So for a box that only needs an address and coordinates, the default is the cheapest. If you need a display name or more, one details call at the top tier buys free autocomplete.

## Options

```ts
createClient({
  key: '...', // required
  fetch, // default: globalThis.fetch
  timeout: 10_000, // ms per attempt; 0 waits as long as it takes
  retries: 2, // extra attempts after a network error, timeout, 429 or 5xx
  headers: {}, // sent with every request
})
```

Every method also takes `{ signal, timeout }`, and the field-masked ones take `fields`. Cancelling through `signal` is never retried. When Google answers with a `Retry-After` header, that wait is used instead of the backoff; if it asks for more than 30 seconds, the error is thrown straight away.

## Errors

Failures throw a `MapsError`:

```ts
import { MapsError } from 'google-maps-fetch'

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
+ import { Client, TravelMode } from 'google-maps-fetch/compat'

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

- **Errors.** API errors resolve with a legacy status in `data.status` (`REQUEST_DENIED`, `INVALID_REQUEST`, `OVER_QUERY_LIMIT`, `NOT_FOUND`, `UNKNOWN_ERROR`) and `data.error_message`, which is how the legacy APIs reported them. That holds for the pass-through methods too. Network errors and timeouts throw a `MapsError`, and so does `placePhoto` when the image can't be fetched.
- **Paging.** `next_page_token` works as before, including sending the token on its own: the client remembers the search that issued it. A token from another process needs the original parameters repeated.
- **`placeDetails` without `fields`.** The legacy API returned every field and billed for all of them. This defaults to `place_id, formatted_address, geometry, address_components` (Essentials). Pass `fields` for anything else; legacy field names are mapped.
- **Addresses in routes.** The Routes API doesn't geocode inputs back to addresses. `start_address`, `end_address`, `origin_addresses` and `destination_addresses` repeat what you passed: the address string, `"lat,lng"` for coordinates, or `""` for a place ID. `geocoded_waypoints` is empty.
- **Language.** `directions` and `distancematrix` ask for English unless you pass `language`, as the legacy APIs did. Left to itself, the Routes API picks a language from the origin.
- **Autocomplete `types`.** `(cities)` and `(regions)` work as before, and `address` becomes street-level types. `geocode` and `establishment` have no equivalent in the new API, so no type filter is applied.
- **`placesNearby` with keyword, name, price, open-now or a page token** runs a Text Search inside the circle, because Nearby Search (New) has none of those. That's a different billing SKU.
- **Photos.** `photo_reference` in results is now a photo name (`places/.../photos/...`). `placePhoto` accepts those and returns an `ArrayBuffer`. Old-style references don't work.
- **`findPlaceFromText`** returns one candidate, as the legacy API did.
- **Not supported:** `client_id` / URL signing, `enc:` polyline waypoints, and axios options other than `timeout`. Pass `config: { timeout, retries, headers }` to the constructor.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The tests use a fake `fetch`, so they don't need a Google key.

## Maintainer

Maintained by [Ninad Sutrave](https://ninadsutrave.com).

## License

[MIT](LICENSE)

This is an independent project, not affiliated with or endorsed by Google. Google Maps is a trademark of Google LLC.
