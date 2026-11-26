---
'google-maps-fetch': patch
---

`/compat` reads `departure_time` and `arrival_time` given as strings, as the legacy client passed them through: seconds since the epoch (`"1893488400"`) or an ISO date. A numeric string used to throw `Invalid time value`; an unreadable time now throws an error that names the value.
