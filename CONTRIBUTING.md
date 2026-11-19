# Contributing

Thanks for helping out. Bug reports, fixes, docs and ideas are all welcome.

## Before you start

- For a bug, open an issue with the steps to reproduce it, or go straight to a PR if the fix is small.
- For a new feature or an API change, open an issue first so we can agree on the shape before you spend time on it.
- If Google's API returned something unexpected, include the request (without your key) and the response body.

## Setup

You need Node 20 or later.

```sh
git clone https://github.com/ninadsutrave/mapsfetch.git
cd mapsfetch
npm install
```

| Command                |                                          |
| :--------------------- | :--------------------------------------- |
| `npm test`             | Run the tests (Vitest)                   |
| `npm run typecheck`    | Type-check the source and tests          |
| `npm run build`        | Build `dist` with tsup                   |
| `npm run format`       | Format with Prettier                     |
| `npm run lint:package` | Check the published package with publint |

The tests run against a fake `fetch` (`test/helpers.ts`) that records each request, so you don't need an API key. Test the request mapping and the response mapping separately, and when you can, base response fixtures on real responses from Google.

There is also a small live suite in `test/live` that calls Google's real APIs, about 25 requests per run. It needs a key with Places API (New), Routes API and Geocoding API enabled:

```sh
echo "GOOGLE_MAPS_KEY=your-key" > .env.local   # git-ignored
npm run test:live
```

`npm test` never runs it. Restrict the key to your IP address and give the project low quotas, since each run is billed like any other traffic (normally inside Google's free monthly allowance).

The package only uses web-standard APIs (`fetch`, `AbortController`, `crypto.randomUUID`, `URLSearchParams`). Please don't import Node built-ins in `src`, so it keeps running on Workers, Deno and other edge runtimes.

## Pull requests

- Keep each PR to one change, and add a test for it.
- Run `npm test`, `npm run typecheck` and `npm run format` before pushing.
- If the change affects users, add a changeset with `npx changeset` and describe it in a sentence or two. It ends up in the changelog.

## Releasing

Releases go through [Changesets](https://github.com/changesets/changesets). When changesets are merged into `main`, the release workflow opens a "Version Packages" PR. Merging that PR publishes to npm using npm trusted publishing, so no token is stored in the repo. See `.github/workflows/release.yml`.
