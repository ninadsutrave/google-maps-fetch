# Security

## Supported versions

Security fixes go into the latest release.

## Reporting a vulnerability

Please don't open a public issue. Use [private vulnerability reporting](https://github.com/ninadsutrave/google-maps-fetch/security/advisories/new) on GitHub, or email ninadsutrave@gmail.com.

You'll get a reply within a few days. Once a fix is released, the advisory is published with credit to you unless you'd rather stay anonymous.

This package sends your API key to Google's endpoints only: in the `X-Goog-Api-Key` header for the Places and Routes APIs, and in the query string for the older JSON APIs (Geocoding, Elevation, Time Zone, Roads), which is how those APIs accept it. Keep server keys out of browser code, and restrict them to the APIs and IP addresses you use in Google Cloud.
