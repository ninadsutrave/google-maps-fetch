# Demo page

The page at https://ninadsutrave.github.io/google-maps-fetch/. Visitors paste their own Google Maps API key, which stays in their browser, and call Places API (New) and the Routes API through google-maps-fetch, with a log of every request it sends. In a real app the key belongs on your server; the browser is only for trying it out.

```sh
npm run build # in the repo root first
cd demo
npm install
npm run dev
```

For local use, the key's website restrictions must allow `http://localhost:5173/*`. You can put it in `demo/.env.local` as `VITE_GOOGLE_MAPS_KEY` instead of pasting it each time (development only; builds ignore it).
