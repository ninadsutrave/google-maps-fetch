// Legacy Places web service requests and responses, mapped to and from Places API (New)
import type {
  AutocompleteRequest,
  OpeningHours,
  Place,
  PlacePrediction,
  QueryPrediction,
  SearchNearbyRequest,
  SearchTextRequest,
  SecondaryOpeningHours,
  StringRange,
} from '../types'
import {
  circleToRectangle,
  priceLevelNumber,
  priceRange,
  strip,
  toLatLng,
  toList,
  toLiteral,
  type LatLngBounds,
  type LatLngLiteral,
  type LegacyLatLng,
} from './params'

// ---------- autocomplete ----------

export interface PlaceAutocompleteParams {
  input: string
  sessiontoken?: string
  offset?: number
  origin?: LegacyLatLng
  location?: LegacyLatLng
  radius?: number
  language?: string
  region?: string
  /** e.g. "(cities)", "address", "establishment", or several as an array or separated by "|" */
  types?: string | string[]
  /** e.g. ["country:in", "country:np"] */
  components?: string[] | string
  strictbounds?: boolean
}

const addressTypes = ['street_address', 'premise', 'subpremise', 'route']

// "geocode" and "establishment" have no primary-type equivalent; leaving the filter off is the closest match
const primaryTypes = (types: string | string[] | undefined) => {
  const list = toList(types)
  if (!list) return undefined
  if (list.some((t) => t === 'geocode' || t === 'establishment')) return undefined
  return [...new Set(list.flatMap((t) => (t === 'address' ? addressTypes : [t])))].slice(0, 5)
}

const regionCodes = (components: string[] | string | undefined) => {
  if (!components) return undefined
  const list = (toList(components) ?? [])
    .map((c) => /^country:(.+)$/.exec(c)?.[1])
    .filter((c): c is string => !!c)
  return list.length ? list : undefined
}

export const autocompleteRequest = (p: PlaceAutocompleteParams): AutocompleteRequest => {
  const circle = p.location ? { center: toLatLng(p.location), radius: p.radius ?? 0 } : undefined
  // a restriction needs an area; a radius of 0 can only bias
  const restrict = p.strictbounds && circle && circle.radius > 0
  return strip({
    input: p.input,
    sessionToken: p.sessiontoken,
    inputOffset: p.offset,
    origin: p.origin ? toLatLng(p.origin) : undefined,
    locationBias: circle && !restrict ? { circle } : undefined,
    locationRestriction: circle && restrict ? { circle } : undefined,
    languageCode: p.language,
    regionCode: p.region,
    includedPrimaryTypes: primaryTypes(p.types),
    includedRegionCodes: regionCodes(p.components),
  })
}

export interface PredictionSubstring {
  offset: number
  length: number
}

export interface PlaceAutocompleteResult {
  description: string
  place_id: string
  reference: string
  types: string[]
  matched_substrings: PredictionSubstring[]
  structured_formatting: {
    main_text: string
    main_text_matched_substrings: PredictionSubstring[]
    secondary_text: string
    secondary_text_matched_substrings: PredictionSubstring[]
  }
  terms: { offset: number; value: string }[]
  distance_meters?: number
}

const substrings = (ranges: StringRange[] | undefined): PredictionSubstring[] =>
  (ranges ?? []).map((r) => ({ offset: r.startOffset ?? 0, length: r.endOffset - (r.startOffset ?? 0) }))

// the legacy API split the description on ", " into terms
const terms = (description: string) => {
  let offset = 0
  return description.split(', ').map((value) => {
    const term = { offset, value }
    offset += value.length + 2
    return term
  })
}

export const toPrediction = (p: PlacePrediction | QueryPrediction): PlaceAutocompleteResult => {
  const placeId = 'placeId' in p ? p.placeId : ''
  return strip({
    description: p.text.text,
    place_id: placeId,
    reference: placeId,
    types: ('types' in p && p.types) || [],
    matched_substrings: substrings(p.text.matches),
    structured_formatting: {
      main_text: p.structuredFormat?.mainText.text ?? p.text.text,
      main_text_matched_substrings: substrings(p.structuredFormat?.mainText.matches),
      secondary_text: p.structuredFormat?.secondaryText?.text ?? '',
      secondary_text_matched_substrings: substrings(p.structuredFormat?.secondaryText?.matches),
    },
    terms: terms(p.text.text),
    distance_meters: 'distanceMeters' in p ? p.distanceMeters : undefined,
  })
}

// ---------- fields ----------

// legacy field name -> Places API (New) fields
const fieldMap: Record<string, string[]> = {
  place_id: ['id'],
  name: ['displayName'],
  formatted_address: ['formattedAddress'],
  geometry: ['location', 'viewport'],
  'geometry/location': ['location'],
  'geometry/location/lat': ['location'],
  'geometry/location/lng': ['location'],
  'geometry/viewport': ['viewport'],
  address_component: ['addressComponents'],
  address_components: ['addressComponents'],
  adr_address: ['adrFormatAddress'],
  business_status: ['businessStatus'],
  permanently_closed: ['businessStatus'],
  icon: ['iconMaskBaseUri'],
  icon_mask_base_uri: ['iconMaskBaseUri'],
  icon_background_color: ['iconBackgroundColor'],
  plus_code: ['plusCode'],
  type: ['types'],
  types: ['types'],
  url: ['googleMapsUri'],
  utc_offset: ['utcOffsetMinutes'],
  vicinity: ['shortFormattedAddress'],
  formatted_phone_number: ['nationalPhoneNumber'],
  international_phone_number: ['internationalPhoneNumber'],
  opening_hours: ['regularOpeningHours', 'currentOpeningHours'],
  current_opening_hours: ['currentOpeningHours'],
  website: ['websiteUri'],
  price_level: ['priceLevel'],
  rating: ['rating'],
  user_ratings_total: ['userRatingCount'],
  photo: ['photos'],
  photos: ['photos'],
  review: ['reviews'],
  reviews: ['reviews'],
  editorial_summary: ['editorialSummary'],
  secondary_opening_hours: ['regularSecondaryOpeningHours', 'currentSecondaryOpeningHours'],
  wheelchair_accessible_entrance: ['accessibilityOptions'],
  // legacy fields with nothing to fetch in the new API
  id: [],
  scope: [],
  reference: [],
  html_attributions: [],
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** Legacy field names (or new ones, passed through) to a field mask, with an optional prefix such as "places." */
export const toFields = (fields: string | string[], prefix = '') => [
  ...new Set(
    ([] as string[])
      .concat(fields)
      .flatMap((f) => f.split(','))
      .map((f) => f.trim())
      .filter(Boolean)
      .flatMap((f) => (fieldMap[f] ?? [camel(f)]).map((n) => prefix + n)),
  ),
]

// ---------- place results ----------

export interface LegacyPlace {
  place_id?: string
  name?: string
  formatted_address?: string
  geometry?: { location: LatLngLiteral; viewport?: LatLngBounds }
  address_components?: { long_name: string; short_name: string; types: string[] }[]
  adr_address?: string
  business_status?: string
  permanently_closed?: boolean
  icon?: string
  icon_mask_base_uri?: string
  icon_background_color?: string
  plus_code?: { global_code?: string; compound_code?: string }
  types?: string[]
  url?: string
  utc_offset?: number
  vicinity?: string
  formatted_phone_number?: string
  international_phone_number?: string
  opening_hours?: LegacyOpeningHours
  current_opening_hours?: LegacyOpeningHours
  website?: string
  price_level?: number
  rating?: number
  user_ratings_total?: number
  photos?: { photo_reference: string; width: number; height: number; html_attributions: string[] }[]
  reviews?: {
    author_name: string
    author_url?: string
    profile_photo_url?: string
    rating?: number
    text: string
    language?: string
    relative_time_description?: string
    time?: number
  }[]
  editorial_summary?: { overview: string; language?: string }
  secondary_opening_hours?: (LegacyOpeningHours & { type?: string })[]
  wheelchair_accessible_entrance?: boolean
  [field: string]: unknown
}

export interface LegacyOpeningHours {
  open_now?: boolean
  periods: { open: { day: number; time: string }; close?: { day: number; time: string } }[]
  weekday_text: string[]
}

const hhmm = (t: { hour: number; minute: number }) => `${String(t.hour).padStart(2, '0')}${String(t.minute).padStart(2, '0')}`

const toHours = (hours: OpeningHours | undefined, openNow: boolean | undefined): LegacyOpeningHours | undefined =>
  hours &&
  strip({
    open_now: openNow ?? hours.openNow,
    periods: (hours.periods ?? []).map((p) => ({
      open: { day: p.open.day, time: hhmm(p.open) },
      ...(p.close ? { close: { day: p.close.day, time: hhmm(p.close) } } : {}),
    })),
    weekday_text: hours.weekdayDescriptions ?? [],
  })

// Place fields handled above; anything else is copied across with a snake_case name
const mapped = new Set([
  'name',
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'viewport',
  'addressComponents',
  'adrFormatAddress',
  'businessStatus',
  'iconMaskBaseUri',
  'iconBackgroundColor',
  'plusCode',
  'types',
  'googleMapsUri',
  'utcOffsetMinutes',
  'shortFormattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'regularOpeningHours',
  'currentOpeningHours',
  'websiteUri',
  'priceLevel',
  'rating',
  'userRatingCount',
  'photos',
  'reviews',
  'editorialSummary',
  'accessibilityOptions',
  'regularSecondaryOpeningHours',
  'currentSecondaryOpeningHours',
])

const toSecondaryHours = (hours: SecondaryOpeningHours[] | undefined) =>
  hours?.map((h) => ({ ...toHours(h, undefined)!, type: h.secondaryHoursType }))

export const toLegacyPlace = (p: Place): LegacyPlace => {
  const place: LegacyPlace = strip({
    place_id: p.id,
    name: p.displayName?.text,
    formatted_address: p.formattedAddress,
    geometry:
      p.location || p.viewport
        ? strip({
            location: toLiteral(p.location),
            viewport: p.viewport ? { northeast: toLiteral(p.viewport.high), southwest: toLiteral(p.viewport.low) } : undefined,
          })
        : undefined,
    address_components: p.addressComponents?.map((c) => ({ long_name: c.longText, short_name: c.shortText, types: c.types })),
    adr_address: p.adrFormatAddress,
    business_status: p.businessStatus,
    permanently_closed: p.businessStatus === 'CLOSED_PERMANENTLY' ? true : undefined,
    // the legacy icon was a PNG URL; Google says to append an image suffix to the mask base
    icon: p.iconMaskBaseUri && `${p.iconMaskBaseUri}.png`,
    icon_mask_base_uri: p.iconMaskBaseUri,
    icon_background_color: p.iconBackgroundColor,
    plus_code: p.plusCode && strip({ global_code: p.plusCode.globalCode, compound_code: p.plusCode.compoundCode }),
    types: p.types,
    url: p.googleMapsUri,
    utc_offset: p.utcOffsetMinutes,
    vicinity: p.shortFormattedAddress,
    formatted_phone_number: p.nationalPhoneNumber,
    international_phone_number: p.internationalPhoneNumber,
    opening_hours: toHours(p.regularOpeningHours, p.currentOpeningHours?.openNow),
    current_opening_hours: toHours(p.currentOpeningHours, undefined),
    website: p.websiteUri,
    price_level: priceLevelNumber(p.priceLevel),
    rating: p.rating,
    user_ratings_total: p.userRatingCount,
    photos: p.photos?.map((ph) => ({
      // the new photo name; pass it back to placePhoto as photoreference
      photo_reference: ph.name,
      width: ph.widthPx,
      height: ph.heightPx,
      html_attributions: (ph.authorAttributions ?? []).map((a) => (a.uri ? `<a href="${a.uri}">${a.displayName}</a>` : a.displayName)),
    })),
    reviews: p.reviews?.map((r) =>
      strip({
        author_name: r.authorAttribution?.displayName ?? '',
        author_url: r.authorAttribution?.uri,
        profile_photo_url: r.authorAttribution?.photoUri,
        rating: r.rating,
        text: (r.text ?? r.originalText)?.text ?? '',
        language: (r.text ?? r.originalText)?.languageCode,
        relative_time_description: r.relativePublishTimeDescription,
        time: r.publishTime ? Math.floor(Date.parse(r.publishTime) / 1000) : undefined,
      }),
    ),
    editorial_summary: p.editorialSummary && strip({ overview: p.editorialSummary.text, language: p.editorialSummary.languageCode }),
    secondary_opening_hours: toSecondaryHours(p.regularSecondaryOpeningHours ?? p.currentSecondaryOpeningHours),
    wheelchair_accessible_entrance: p.accessibilityOptions?.wheelchairAccessibleEntrance,
  })
  for (const [k, v] of Object.entries(p)) if (!mapped.has(k) && v !== undefined) place[snake(k)] = v
  return place
}

// ---------- text, nearby and find-place search ----------

export interface TextSearchParams {
  /** Required, except when pagetoken continues a search this client made */
  query?: string
  region?: string
  location?: LegacyLatLng
  radius?: number
  language?: string
  minprice?: number
  maxprice?: number
  opennow?: boolean
  pagetoken?: string
  /** The legacy API used only the first type */
  type?: string | string[]
  /** Not in the legacy API: legacy field names (or new ones) to fetch instead of the defaults */
  fields?: string[]
}

export const textSearchRequest = (p: TextSearchParams): SearchTextRequest =>
  strip({
    textQuery: p.query ?? '',
    regionCode: p.region,
    languageCode: p.language,
    locationBias: p.location ? { circle: { center: toLatLng(p.location), radius: p.radius ?? 0 } } : undefined,
    includedType: toList(p.type)?.[0],
    openNow: p.opennow,
    priceLevels: priceRange(p.minprice, p.maxprice),
    pageToken: p.pagetoken,
  })

export interface PlacesNearbyParams {
  location: LegacyLatLng
  radius?: number
  keyword?: string
  name?: string
  language?: string
  minprice?: number
  maxprice?: number
  opennow?: boolean
  /** "prominence" or "distance" */
  rankby?: string
  /** The legacy API used only the first type */
  type?: string | string[]
  pagetoken?: string
  fields?: string[]
}

export type NearbyPlan = { kind: 'nearby'; request: SearchNearbyRequest } | { kind: 'text'; request: SearchTextRequest }

// Nearby Search (New) has no keyword, name, open-now, price or paging; requests that use them go to Text Search
export const nearbyPlan = (p: PlacesNearbyParams): NearbyPlan => {
  const center = toLatLng(p.location)
  const radius = p.rankby === 'distance' || p.radius == null ? 50_000 : p.radius
  const byDistance = p.rankby === 'distance'
  const type = toList(p.type)?.[0]
  if (p.keyword || p.name || p.opennow || p.minprice != null || p.maxprice != null || p.pagetoken) {
    return {
      kind: 'text',
      request: strip({
        textQuery: [p.keyword, p.name].filter(Boolean).join(' ') || (type ?? 'places').replace(/_/g, ' '),
        locationRestriction: circleToRectangle(center, radius),
        includedType: type,
        openNow: p.opennow,
        priceLevels: priceRange(p.minprice, p.maxprice),
        rankPreference: byDistance ? 'DISTANCE' : undefined,
        languageCode: p.language,
        pageToken: p.pagetoken,
      }),
    }
  }
  return {
    kind: 'nearby',
    request: strip({
      locationRestriction: { circle: { center, radius } },
      includedTypes: type ? [type] : undefined,
      rankPreference: byDistance ? 'DISTANCE' : 'POPULARITY',
      languageCode: p.language,
    }),
  }
}
