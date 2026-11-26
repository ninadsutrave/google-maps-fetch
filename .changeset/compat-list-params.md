---
'google-maps-fetch': patch
---

`/compat` accepts list params the way the legacy client did, as an array or a `|`-separated string: `types` in `placeAutocomplete` (an array used to throw `types.split is not a function`), `type` in `placesNearby` and `textSearch` (only the first is used, as before), and `avoid` and `transit_mode` in `directions` and `distancematrix`.
