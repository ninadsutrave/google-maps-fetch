// Types for the parts of Google's REST APIs this package touches. Google adds fields over time,
// so objects keep an index signature: anything you put in a field mask comes through.

export interface LatLng {
  latitude: number
  longitude: number
}

/** Coordinates in any common shape: { latitude, longitude }, { lat, lng } or [lat, lng] */
export type LatLngInput = LatLng | { lat: number; lng: number } | [number, number]

export interface Circle {
  center: LatLng
  /** Metres */
  radius: number
}

export interface Viewport {
  low: LatLng
  high: LatLng
}

export type Area = { circle: Circle } | { rectangle: Viewport }

export interface LocalizedText {
  text: string
  languageCode?: string
}

// ---------- Places API (New) ----------

export interface StringRange {
  /** Omitted by Google when it is 0 */
  startOffset?: number
  endOffset: number
}

export interface FormattableText {
  text: string
  matches?: StringRange[]
}

export interface StructuredFormat {
  mainText: FormattableText
  secondaryText?: FormattableText
}

export interface PlacePrediction {
  /** Resource name, "places/{placeId}" */
  place: string
  placeId: string
  text: FormattableText
  structuredFormat?: StructuredFormat
  types?: string[]
  distanceMeters?: number
}

export interface QueryPrediction {
  text: FormattableText
  structuredFormat?: StructuredFormat
}

export interface Suggestion {
  placePrediction?: PlacePrediction
  queryPrediction?: QueryPrediction
}

export interface AutocompleteRequest {
  input: string
  locationBias?: Area
  locationRestriction?: Area
  /** Up to 5 primary types, or only "(regions)", or only "(cities)" */
  includedPrimaryTypes?: string[]
  /** Up to 15 two-letter region codes */
  includedRegionCodes?: string[]
  languageCode?: string
  regionCode?: string
  origin?: LatLng
  inputOffset?: number
  includeQueryPredictions?: boolean
  sessionToken?: string
  includePureServiceAreaBusinesses?: boolean
  [field: string]: unknown
}

export interface AutocompleteResponse {
  suggestions?: Suggestion[]
}

export interface AddressComponent {
  longText: string
  shortText: string
  types: string[]
  languageCode?: string
}

export interface Photo {
  /** Resource name, "places/{placeId}/photos/{photo}" */
  name: string
  widthPx: number
  heightPx: number
  authorAttributions?: { displayName: string; uri?: string; photoUri?: string }[]
}

export interface OpeningHours {
  openNow?: boolean
  periods?: { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[]
  weekdayDescriptions?: string[]
}

export interface Review {
  rating?: number
  text?: LocalizedText
  originalText?: LocalizedText
  relativePublishTimeDescription?: string
  publishTime?: string
  authorAttribution?: { displayName: string; uri?: string; photoUri?: string }
}

export interface Place {
  /** Resource name, "places/{placeId}" */
  name?: string
  id?: string
  displayName?: LocalizedText
  formattedAddress?: string
  shortFormattedAddress?: string
  adrFormatAddress?: string
  addressComponents?: AddressComponent[]
  location?: LatLng
  viewport?: Viewport
  plusCode?: { globalCode?: string; compoundCode?: string }
  types?: string[]
  primaryType?: string
  googleMapsUri?: string
  websiteUri?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  rating?: number
  userRatingCount?: number
  /** PRICE_LEVEL_FREE ... PRICE_LEVEL_VERY_EXPENSIVE */
  priceLevel?: string
  /** OPERATIONAL, CLOSED_TEMPORARILY or CLOSED_PERMANENTLY */
  businessStatus?: string
  utcOffsetMinutes?: number
  regularOpeningHours?: OpeningHours
  currentOpeningHours?: OpeningHours
  photos?: Photo[]
  reviews?: Review[]
  editorialSummary?: LocalizedText
  iconMaskBaseUri?: string
  iconBackgroundColor?: string
  [field: string]: unknown
}

export interface GetPlaceOptions {
  languageCode?: string
  regionCode?: string
  sessionToken?: string
}

export interface SearchTextRequest {
  textQuery: string
  includedType?: string
  strictTypeFiltering?: boolean
  openNow?: boolean
  minRating?: number
  priceLevels?: string[]
  /** RELEVANCE or DISTANCE */
  rankPreference?: string
  locationBias?: Area
  /** Only a rectangle is accepted here */
  locationRestriction?: { rectangle: Viewport }
  /** 1 to 20 */
  pageSize?: number
  pageToken?: string
  languageCode?: string
  regionCode?: string
  [field: string]: unknown
}

export interface SearchTextResponse {
  places?: Place[]
  nextPageToken?: string
  [field: string]: unknown
}

export interface SearchNearbyRequest {
  locationRestriction: { circle: Circle }
  includedTypes?: string[]
  excludedTypes?: string[]
  includedPrimaryTypes?: string[]
  excludedPrimaryTypes?: string[]
  /** 1 to 20 */
  maxResultCount?: number
  /** POPULARITY or DISTANCE */
  rankPreference?: string
  languageCode?: string
  regionCode?: string
  [field: string]: unknown
}

export interface SearchNearbyResponse {
  places?: Place[]
  [field: string]: unknown
}

export interface PhotoMedia {
  name: string
  /** Short-lived URL of the image */
  photoUri: string
}

// ---------- Routes API ----------

export interface Location {
  latLng: LatLng
  heading?: number
}

export interface Waypoint {
  location?: Location
  placeId?: string
  address?: string
  via?: boolean
  vehicleStopover?: boolean
  sideOfRoad?: boolean
}

/** A waypoint, or a shorthand: an address string, or coordinates in any shape LatLngInput accepts */
export type WaypointInput = Waypoint | string | LatLngInput

/** DRIVE, BICYCLE, WALK, TWO_WHEELER or TRANSIT */
export type TravelMode = 'DRIVE' | 'BICYCLE' | 'WALK' | 'TWO_WHEELER' | 'TRANSIT' | (string & {})

export interface RouteModifiers {
  avoidTolls?: boolean
  avoidHighways?: boolean
  avoidFerries?: boolean
  avoidIndoor?: boolean
  [field: string]: unknown
}

export interface ComputeRoutesRequest {
  origin: WaypointInput
  destination: WaypointInput
  intermediates?: WaypointInput[]
  travelMode?: TravelMode
  /** TRAFFIC_UNAWARE, TRAFFIC_AWARE or TRAFFIC_AWARE_OPTIMAL. Traffic-aware routing is billed at a higher tier. */
  routingPreference?: string
  /** RFC 3339 timestamp */
  departureTime?: string
  arrivalTime?: string
  computeAlternativeRoutes?: boolean
  routeModifiers?: RouteModifiers
  languageCode?: string
  regionCode?: string
  /** METRIC or IMPERIAL */
  units?: string
  optimizeWaypointOrder?: boolean
  trafficModel?: string
  transitPreferences?: { allowedTravelModes?: string[]; routingPreference?: string }
  [field: string]: unknown
}

export interface Polyline {
  encodedPolyline?: string
}

export interface LocalizedValues {
  distance?: LocalizedText
  duration?: LocalizedText
  staticDuration?: LocalizedText
}

export interface RouteLegStep {
  distanceMeters?: number
  staticDuration?: string
  polyline?: Polyline
  startLocation?: Location
  endLocation?: Location
  navigationInstruction?: { maneuver?: string; instructions?: string }
  localizedValues?: LocalizedValues
  travelMode?: string
  [field: string]: unknown
}

export interface RouteLeg {
  distanceMeters?: number
  /** e.g. "1234s"; includes traffic when the request was traffic-aware */
  duration?: string
  /** Without traffic */
  staticDuration?: string
  polyline?: Polyline
  startLocation?: Location
  endLocation?: Location
  steps?: RouteLegStep[]
  localizedValues?: LocalizedValues
  [field: string]: unknown
}

export interface Route {
  description?: string
  legs?: RouteLeg[]
  distanceMeters?: number
  duration?: string
  staticDuration?: string
  polyline?: Polyline
  viewport?: Viewport
  warnings?: string[]
  optimizedIntermediateWaypointIndex?: number[]
  localizedValues?: LocalizedValues
  [field: string]: unknown
}

export interface ComputeRoutesResponse {
  routes?: Route[]
  [field: string]: unknown
}

export interface RouteMatrixOrigin {
  waypoint: Waypoint
  routeModifiers?: RouteModifiers
}

export interface RouteMatrixDestination {
  waypoint: Waypoint
}

export interface ComputeRouteMatrixRequest {
  origins: (WaypointInput | RouteMatrixOrigin)[]
  destinations: (WaypointInput | RouteMatrixDestination)[]
  travelMode?: TravelMode
  routingPreference?: string
  departureTime?: string
  arrivalTime?: string
  languageCode?: string
  regionCode?: string
  units?: string
  trafficModel?: string
  transitPreferences?: { allowedTravelModes?: string[]; routingPreference?: string }
  [field: string]: unknown
}

export interface RouteMatrixElement {
  originIndex: number
  destinationIndex: number
  status?: { code?: number; message?: string }
  /** ROUTE_EXISTS or ROUTE_NOT_FOUND */
  condition?: string
  distanceMeters?: number
  duration?: string
  staticDuration?: string
  localizedValues?: LocalizedValues
  [field: string]: unknown
}

// ---------- Geocoding API ----------

export interface GeocodeResult {
  place_id: string
  formatted_address: string
  address_components: { long_name: string; short_name: string; types: string[] }[]
  geometry: {
    location: { lat: number; lng: number }
    location_type: string
    viewport: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } }
    bounds?: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } }
  }
  types: string[]
  partial_match?: boolean
  plus_code?: { global_code: string; compound_code?: string }
  [field: string]: unknown
}

export interface GeocodeRequest {
  address?: string
  placeId?: string
  /** e.g. { country: 'IN', postal_code: '411001' } or "country:IN|postal_code:411001" */
  components?: string | Record<string, string>
  bounds?: Viewport
  language?: string
  region?: string
}

export interface ReverseGeocodeRequest {
  location: LatLngInput
  resultType?: string[]
  locationType?: string[]
  language?: string
}

// ---------- Elevation API ----------

export type ElevationRequest =
  /** Up to 512 points */
  | { locations: LatLngInput[] }
  /** Evenly spaced samples along a path */
  | { path: LatLngInput[]; samples: number }

export interface ElevationResult {
  /** Metres above sea level */
  elevation: number
  location: { lat: number; lng: number }
  /** Metres between the data points the value was interpolated from */
  resolution?: number
}

// ---------- Time Zone API ----------

export interface TimeZoneRequest {
  location: LatLngInput
  /** When to resolve daylight saving for: a Date, or seconds since the epoch. Default now. */
  timestamp?: Date | number
  language?: string
}

export interface TimeZone {
  /** Seconds of daylight saving offset at the timestamp */
  dstOffset: number
  /** Seconds from UTC, without daylight saving */
  rawOffset: number
  /** IANA ID, e.g. "Asia/Kolkata" */
  timeZoneId: string
  timeZoneName: string
}

// ---------- Geolocation API ----------

export interface GeolocateRequest {
  homeMobileCountryCode?: number
  homeMobileNetworkCode?: number
  /** gsm, cdma, wcdma, lte or nr */
  radioType?: string
  carrier?: string
  /** Fall back to the caller's IP address. Default true; from a server that's the server's IP. */
  considerIp?: boolean
  cellTowers?: {
    cellId: number
    locationAreaCode?: number
    mobileCountryCode?: number
    mobileNetworkCode?: number
    [field: string]: unknown
  }[]
  wifiAccessPoints?: { macAddress: string; signalStrength?: number; channel?: number; [field: string]: unknown }[]
}

export interface GeolocateResponse {
  location: { lat: number; lng: number }
  /** Metres, at 68% confidence */
  accuracy: number
}

// ---------- Roads API ----------

export interface SnappedPoint {
  location: LatLng
  /** Index of the input point this was snapped from; missing for interpolated points */
  originalIndex?: number
  placeId: string
}

export interface SnapToRoadsRequest {
  /** Up to 100 points, in order of travel */
  path: LatLngInput[]
  /** Add points along the road between the snapped ones */
  interpolate?: boolean
}

export interface NearestRoadsRequest {
  /** Up to 100 independent points */
  points: LatLngInput[]
}

// ---------- Address Validation API ----------

export interface PostalAddress {
  regionCode?: string
  languageCode?: string
  postalCode?: string
  administrativeArea?: string
  locality?: string
  sublocality?: string
  addressLines?: string[]
  recipients?: string[]
  organization?: string
  [field: string]: unknown
}

export interface ValidateAddressRequest {
  address: PostalAddress
  /** responseId of the previous call when re-validating the same address */
  previousResponseId?: string
  /** USPS CASS processing, US and PR only */
  enableUspsCass?: boolean
  sessionToken?: string
  [field: string]: unknown
}

export interface AddressComponentValidation {
  componentName: LocalizedText
  componentType: string
  /** CONFIRMED, UNCONFIRMED_BUT_PLAUSIBLE or UNCONFIRMED_AND_SUSPICIOUS */
  confirmationLevel?: string
  inferred?: boolean
  spellCorrected?: boolean
  replaced?: boolean
  unexpected?: boolean
}

export interface ValidateAddressResponse {
  result: {
    verdict: {
      inputGranularity?: string
      validationGranularity?: string
      geocodeGranularity?: string
      addressComplete?: boolean
      hasUnconfirmedComponents?: boolean
      hasInferredComponents?: boolean
      hasReplacedComponents?: boolean
      /** FIX, CONFIRM_ADD_SUBPREMISES, CONFIRM or ACCEPT */
      possibleNextAction?: string
      [field: string]: unknown
    }
    address: {
      formattedAddress?: string
      postalAddress?: PostalAddress
      addressComponents?: AddressComponentValidation[]
      missingComponentTypes?: string[]
      unconfirmedComponentTypes?: string[]
      unresolvedTokens?: string[]
    }
    geocode?: {
      location?: LatLng
      placeId?: string
      placeTypes?: string[]
      featureSizeMeters?: number
      [field: string]: unknown
    }
    metadata?: { business?: boolean; poBox?: boolean; residential?: boolean }
    [field: string]: unknown
  }
  responseId: string
}

/** How the address was used in the end, for Google's feedback endpoint */
export type ValidationConclusion = 'VALIDATED_VERSION_USED' | 'USER_VERSION_USED' | 'UNVALIDATED_VERSION_USED' | 'UNUSED'
