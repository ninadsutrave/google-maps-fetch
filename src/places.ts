import type { CallOptions, FieldOptions, Send } from './http'
import type {
  AutocompleteRequest,
  AutocompleteResponse,
  GetPlaceOptions,
  PhotoMedia,
  Place,
  SearchNearbyRequest,
  SearchNearbyResponse,
  SearchTextRequest,
  SearchTextResponse,
} from './types'
import { newSessionToken } from './util'

const base = 'https://places.googleapis.com/v1'

// The cheapest useful field masks. Place Details in the Essentials tier; Text and Nearby Search have no
// Essentials tier with names or coordinates, so these are Pro. Ask for more fields and you pay for more.
export const placeFields = ['id', 'formattedAddress', 'location']
export const searchTextFields = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'nextPageToken']
export const searchNearbyFields = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.types']

const placePath = (id: string) => (id.startsWith('places/') ? id : `places/${encodeURIComponent(id)}`)

export interface PlaceSession {
  /** The token in use until the next get() */
  readonly token: string
  /** sessionToken is filled in for you */
  autocomplete(request: AutocompleteRequest, options?: FieldOptions): Promise<AutocompleteResponse>
  /** Fetches the place and ends the session; the next autocomplete starts a new one */
  get(id: string, options?: FieldOptions & Omit<GetPlaceOptions, 'sessionToken'>): Promise<Place>
}

export function createPlaces(send: Send) {
  const autocomplete = ({ ...request }: AutocompleteRequest, { fields, ...call }: FieldOptions = {}) =>
    send<AutocompleteResponse>({ method: 'POST', url: `${base}/places:autocomplete`, body: request, fields }, call)

  const get = (
    id: string,
    { fields = placeFields, languageCode, regionCode, sessionToken, ...call }: FieldOptions & GetPlaceOptions = {},
  ) => send<Place>({ method: 'GET', url: `${base}/${placePath(id)}`, query: { languageCode, regionCode, sessionToken }, fields }, call)

  const searchText = (request: SearchTextRequest, { fields = searchTextFields, ...call }: FieldOptions = {}) =>
    send<SearchTextResponse>({ method: 'POST', url: `${base}/places:searchText`, body: request, fields }, call)

  const searchNearby = (request: SearchNearbyRequest, { fields = searchNearbyFields, ...call }: FieldOptions = {}) =>
    send<SearchNearbyResponse>({ method: 'POST', url: `${base}/places:searchNearby`, body: request, fields }, call)

  /** A short-lived image URL for a photo name from place.photos[].name */
  const photo = (name: string, { maxWidthPx, maxHeightPx, ...call }: CallOptions & { maxWidthPx?: number; maxHeightPx?: number } = {}) =>
    send<PhotoMedia>(
      {
        method: 'GET',
        url: `${base}/${name}/media`,
        // Google needs at least one size
        query: { maxWidthPx: maxWidthPx ?? (maxHeightPx ? undefined : 800), maxHeightPx, skipHttpRedirect: true },
      },
      call,
    )

  /** Groups autocomplete calls and the details call that follows into one billed session */
  const session = (): PlaceSession => {
    let token = newSessionToken()
    return {
      get token() {
        return token
      },
      autocomplete: (request, options) => autocomplete({ ...request, sessionToken: token }, options),
      get: async (id, options) => {
        try {
          return await get(id, { ...options, sessionToken: token })
        } finally {
          token = newSessionToken()
        }
      },
    }
  }

  return { autocomplete, get, searchText, searchNearby, photo, session }
}

export type Places = ReturnType<typeof createPlaces>
