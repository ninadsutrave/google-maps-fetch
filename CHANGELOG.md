# google-maps-fetch

## 0.1.7

### Patch Changes

- 39a1679: `/compat` accepts list params the way the legacy client did, as an array or a `|`-separated string: `types` in `placeAutocomplete` (an array used to throw `types.split is not a function`), `type` in `placesNearby` and `textSearch` (only the first is used, as before), and `avoid` and `transit_mode` in `directions` and `distancematrix`.

## 0.1.6

### Patch Changes

- 4c14808: Add a demo page where you can try the client in the browser with your own key, and use it as the npm homepage. The README's license line now names the copyright holder.

## 0.1.5

### Patch Changes

- 73b3276: README: link the google-places-autocomplete-hook demo page.

## 0.1.4

### Patch Changes

- 791ea66: README: step-by-step Google Cloud setup for a server key, and what PERMISSION_DENIED usually means.

## 0.1.3

### Patch Changes

- 833c007: README: name the legacy API error people search for, and fix the Pollen `request()` example, which is a GET with query parameters.

## 0.1.2

### Patch Changes

- 0193c3d: README: attribute the October 2026 legacy API change to Google's notice.

## 0.1.1

### Patch Changes

- 8dab6a3: Add maintainer details to the README and package metadata.

## 0.1.0

- First release: a fetch-based client for Places API (New), the Routes API, Geocoding, Address Validation, Elevation, Time Zone, Geolocation and Roads, with `request()` for any other Maps REST API, and `google-maps-fetch/compat`, a replacement for `@googlemaps/google-maps-services-js`.
