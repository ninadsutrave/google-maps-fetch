import { describe, expect, it } from 'vitest'
import {
  AddressType,
  Client,
  DirectionsReponseStatus,
  Language,
  Maneuver,
  MapsError,
  PlaceAutocompleteType,
  PlaceType1,
  PlaceType2,
  Status,
  TransitRoutingPreference,
  TravelMode,
  TravelRestriction,
  UnitSystem,
} from '../src/compat'
import { googleError, mockFetch, query } from './helpers'

const key = 'test-key'

// Shaped like real Places API (New) responses; JSON leaves out startOffset when it is 0
const puneSuggestion = {
  placePrediction: {
    place: 'places/ChIJpune',
    placeId: 'ChIJpune',
    text: { text: 'Pune, Maharashtra, India', matches: [{ endOffset: 3 }] },
    structuredFormat: { mainText: { text: 'Pune', matches: [{ endOffset: 3 }] }, secondaryText: { text: 'Maharashtra, India' } },
    types: ['locality', 'political', 'geocode'],
    distanceMeters: 1500,
  },
}

describe('placeAutocomplete', () => {
  it('maps legacy params to an Autocomplete (New) request', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { suggestions: [puneSuggestion] } }))
    const client = new Client({ fetch })
    await client.placeAutocomplete({
      params: {
        key,
        input: 'Pun',
        sessiontoken: 'tok',
        offset: 3,
        origin: '18.5,73.8',
        location: { lat: 18.5, lng: 73.8 },
        radius: 2000,
        language: 'en',
        region: 'in',
        types: PlaceAutocompleteType.cities,
        components: ['country:in', 'country:np'],
      },
    })
    expect(calls[0].url).toBe('https://places.googleapis.com/v1/places:autocomplete')
    expect(calls[0].headers['X-Goog-Api-Key']).toBe(key)
    expect(calls[0].body).toEqual({
      input: 'Pun',
      sessionToken: 'tok',
      inputOffset: 3,
      origin: { latitude: 18.5, longitude: 73.8 },
      locationBias: { circle: { center: { latitude: 18.5, longitude: 73.8 }, radius: 2000 } },
      languageCode: 'en',
      regionCode: 'in',
      includedPrimaryTypes: ['(cities)'],
      includedRegionCodes: ['in', 'np'],
    })
  })

  it('strictbounds restricts; address types expand; geocode and establishment drop the filter', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    const client = new Client({ fetch })
    await client.placeAutocomplete({ params: { key, input: 'a', location: [1, 2], radius: 500, strictbounds: true, types: 'address' } })
    await client.placeAutocomplete({ params: { key, input: 'a', location: [1, 2], strictbounds: true, types: 'establishment' } })
    await client.placeAutocomplete({ params: { key, input: 'a', components: 'country:us|country:pr', types: 'geocode' } })
    expect(calls[0].body.locationRestriction).toEqual({ circle: { center: { latitude: 1, longitude: 2 }, radius: 500 } })
    expect(calls[0].body.includedPrimaryTypes).toEqual(['street_address', 'premise', 'subpremise', 'route'])
    // no radius: can't restrict, so it biases towards the point
    expect(calls[1].body.locationBias).toEqual({ circle: { center: { latitude: 1, longitude: 2 }, radius: 0 } })
    expect(calls[1].body).not.toHaveProperty('includedPrimaryTypes')
    expect(calls[2].body.includedRegionCodes).toEqual(['us', 'pr'])
    expect(calls[2].body).not.toHaveProperty('includedPrimaryTypes')
  })

  it('list params work as arrays or "|" strings, as the legacy client sent both', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    const client = new Client({ fetch })
    const types = ['locality', 'neighborhood'] as unknown as PlaceAutocompleteType
    await client.placeAutocomplete({ params: { key, input: 'a', types } })
    await client.placeAutocomplete({ params: { key, input: 'a', types: 'locality|neighborhood' } })
    await client.placeAutocomplete({
      params: { key, input: 'a', types: ['address'] as unknown as PlaceAutocompleteType, components: ['country:us'] },
    })
    expect(calls[0].body.includedPrimaryTypes).toEqual(['locality', 'neighborhood'])
    expect(calls[1].body.includedPrimaryTypes).toEqual(['locality', 'neighborhood'])
    expect(calls[2].body.includedPrimaryTypes).toEqual(['street_address', 'premise', 'subpremise', 'route'])
    expect(calls[2].body.includedRegionCodes).toEqual(['us'])
  })

  it('returns predictions in the legacy shape', async () => {
    const { fetch } = mockFetch(() => ({ body: { suggestions: [puneSuggestion, { queryPrediction: { text: { text: 'pune food' } } }] } }))
    const res = await new Client({ fetch }).placeAutocomplete({ params: { key, input: 'Pun' } })
    expect(res.status).toBe(200)
    expect(res.data).toEqual({
      status: 'OK',
      predictions: [
        {
          description: 'Pune, Maharashtra, India',
          place_id: 'ChIJpune',
          reference: 'ChIJpune',
          types: ['locality', 'political', 'geocode'],
          matched_substrings: [{ offset: 0, length: 3 }],
          structured_formatting: {
            main_text: 'Pune',
            main_text_matched_substrings: [{ offset: 0, length: 3 }],
            secondary_text: 'Maharashtra, India',
            secondary_text_matched_substrings: [],
          },
          terms: [
            { offset: 0, value: 'Pune' },
            { offset: 6, value: 'Maharashtra' },
            { offset: 19, value: 'India' },
          ],
          distance_meters: 1500,
        },
      ],
    })
  })

  it('no suggestions is ZERO_RESULTS', async () => {
    const { fetch } = mockFetch(() => ({ body: {} }))
    const res = await new Client({ fetch }).placeAutocomplete({ params: { key, input: 'zzzz' } })
    expect(res.data).toEqual({ status: Status.ZERO_RESULTS, predictions: [] })
  })

  it('an API error resolves with a legacy status, as the legacy API did', async () => {
    const { fetch } = mockFetch(() => googleError(403, 'PERMISSION_DENIED', 'Places API (New) has not been used in project 123'))
    const res = await new Client({ fetch }).placeAutocomplete({ params: { key, input: 'x' } })
    expect(res.status).toBe(403)
    expect(res.data).toEqual({
      status: 'REQUEST_DENIED',
      error_message: 'Places API (New) has not been used in project 123',
      predictions: [],
    })
  })

  it('other error codes map to their legacy statuses', async () => {
    const cases: [number, string, string][] = [
      [400, 'INVALID_ARGUMENT', 'INVALID_REQUEST'],
      [429, 'RESOURCE_EXHAUSTED', 'OVER_QUERY_LIMIT'],
      [404, 'NOT_FOUND', 'NOT_FOUND'],
      [500, 'INTERNAL', 'UNKNOWN_ERROR'],
    ]
    for (const [code, status, legacy] of cases) {
      const { fetch } = mockFetch(() => googleError(code, status, 'x'))
      const res = await new Client({ fetch, config: { retries: 0 } }).placeAutocomplete({ params: { key, input: 'x' } })
      expect(res.data.status).toBe(legacy)
    }
  })

  it('network errors and timeouts still throw', async () => {
    const { fetch } = mockFetch(() => new TypeError('fetch failed'))
    const client = new Client({ fetch, config: { retries: 0 } })
    await expect(client.placeAutocomplete({ params: { key, input: 'x' } })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('placeQueryAutocomplete includes query predictions', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { suggestions: [{ queryPrediction: { text: { text: 'pizza near me' } } }] } }))
    const res = await new Client({ fetch }).placeQueryAutocomplete({ params: { key, input: 'pizza' } })
    expect(calls[0].body.includeQueryPredictions).toBe(true)
    expect(res.data.predictions[0]).toMatchObject({ description: 'pizza near me', place_id: '' })
  })
})

const fullPlace = {
  id: 'ChIJcafe',
  displayName: { text: 'Vaishali', languageCode: 'en' },
  formattedAddress: '1218/1, FC Road, Pune 411004, India',
  shortFormattedAddress: 'FC Road, Pune',
  location: { latitude: 18.52, longitude: 73.84 },
  viewport: { low: { latitude: 18.51, longitude: 73.83 }, high: { latitude: 18.53, longitude: 73.85 } },
  addressComponents: [{ longText: '411004', shortText: '411004', types: ['postal_code'], languageCode: 'en' }],
  regularOpeningHours: {
    openNow: false,
    periods: [{ open: { day: 1, hour: 7, minute: 0 }, close: { day: 1, hour: 23, minute: 30 } }],
    weekdayDescriptions: ['Monday: 7:00 AM – 11:30 PM'],
  },
  currentOpeningHours: { openNow: true },
  priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
  rating: 4.3,
  userRatingCount: 51234,
  googleMapsUri: 'https://maps.google.com/?cid=1',
  websiteUri: 'https://vaishali.example',
  nationalPhoneNumber: '020 2553 1244',
  internationalPhoneNumber: '+91 20 2553 1244',
  businessStatus: 'OPERATIONAL',
  utcOffsetMinutes: 330,
  photos: [
    {
      name: 'places/ChIJcafe/photos/AbC',
      widthPx: 4000,
      heightPx: 3000,
      authorAttributions: [{ displayName: 'Asha', uri: 'https://maps.google.com/u/1' }],
    },
  ],
  reviews: [
    {
      rating: 5,
      text: { text: 'Great SPDP', languageCode: 'en' },
      relativePublishTimeDescription: 'a month ago',
      publishTime: '2026-10-01T10:00:00Z',
      authorAttribution: { displayName: 'Rohan', uri: 'https://maps.google.com/u/2', photoUri: 'https://lh3/p' },
    },
  ],
  servesBreakfast: true,
}

describe('placeDetails', () => {
  it('defaults to the Essentials fields, with viewport for geometry', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { id: 'p' } }))
    await new Client({ fetch }).placeDetails({ params: { key, place_id: 'p', language: 'hi', sessiontoken: 's' } })
    expect(calls[0].url.split('?')[0]).toBe('https://places.googleapis.com/v1/places/p')
    expect(calls[0].headers['X-Goog-FieldMask']).toBe('id,formattedAddress,location,viewport,addressComponents')
    expect(query(calls[0].url)).toEqual({ languageCode: 'hi', sessionToken: 's' })
  })

  it('maps legacy field names, including singular ones and paths', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    await new Client({ fetch }).placeDetails({
      params: {
        key,
        place_id: 'p',
        fields: ['name', 'geometry/location', 'opening_hours', 'price_level', 'photo', 'review', 'url', 'serves_breakfast'],
      },
    })
    expect(calls[0].headers['X-Goog-FieldMask']).toBe(
      'displayName,location,regularOpeningHours,currentOpeningHours,priceLevel,photos,reviews,googleMapsUri,servesBreakfast',
    )
  })

  it('returns the place in the legacy shape', async () => {
    const { fetch } = mockFetch(() => ({ body: fullPlace }))
    const res = await new Client({ fetch }).placeDetails({ params: { key, place_id: 'ChIJcafe', fields: ['name'] } })
    expect(res.data.status).toBe('OK')
    expect(res.data.html_attributions).toEqual([])
    expect(res.data.result).toEqual({
      place_id: 'ChIJcafe',
      name: 'Vaishali',
      formatted_address: '1218/1, FC Road, Pune 411004, India',
      vicinity: 'FC Road, Pune',
      geometry: {
        location: { lat: 18.52, lng: 73.84 },
        viewport: { northeast: { lat: 18.53, lng: 73.85 }, southwest: { lat: 18.51, lng: 73.83 } },
      },
      address_components: [{ long_name: '411004', short_name: '411004', types: ['postal_code'] }],
      opening_hours: {
        open_now: true,
        periods: [{ open: { day: 1, time: '0700' }, close: { day: 1, time: '2330' } }],
        weekday_text: ['Monday: 7:00 AM – 11:30 PM'],
      },
      current_opening_hours: { open_now: true, periods: [], weekday_text: [] },
      price_level: 1,
      rating: 4.3,
      user_ratings_total: 51234,
      url: 'https://maps.google.com/?cid=1',
      website: 'https://vaishali.example',
      formatted_phone_number: '020 2553 1244',
      international_phone_number: '+91 20 2553 1244',
      business_status: 'OPERATIONAL',
      utc_offset: 330,
      photos: [
        {
          photo_reference: 'places/ChIJcafe/photos/AbC',
          width: 4000,
          height: 3000,
          html_attributions: ['<a href="https://maps.google.com/u/1">Asha</a>'],
        },
      ],
      reviews: [
        {
          author_name: 'Rohan',
          author_url: 'https://maps.google.com/u/2',
          profile_photo_url: 'https://lh3/p',
          rating: 5,
          text: 'Great SPDP',
          language: 'en',
          relative_time_description: 'a month ago',
          time: 1790848800,
        },
      ],
      serves_breakfast: true,
    })
  })

  it('marks permanently closed places', async () => {
    const { fetch } = mockFetch(() => ({ body: { businessStatus: 'CLOSED_PERMANENTLY' } }))
    const res = await new Client({ fetch }).placeDetails({ params: { key, place_id: 'p', fields: ['business_status'] } })
    expect(res.data.result).toEqual({ business_status: 'CLOSED_PERMANENTLY', permanently_closed: true })
  })
})

describe('searches', () => {
  it('textSearch maps params, prices and paging', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { places: [{ id: 'a', displayName: { text: 'A' } }], nextPageToken: 'next' } }))
    const res = await new Client({ fetch }).textSearch({
      params: {
        key,
        query: 'misal in Pune',
        location: [18.5, 73.8],
        radius: 3000,
        minprice: 0,
        maxprice: 2,
        opennow: true,
        type: 'restaurant',
        language: 'en',
        region: 'in',
      },
    })
    expect(calls[0].url).toBe('https://places.googleapis.com/v1/places:searchText')
    expect(calls[0].body).toEqual({
      textQuery: 'misal in Pune',
      regionCode: 'in',
      languageCode: 'en',
      locationBias: { circle: { center: { latitude: 18.5, longitude: 73.8 }, radius: 3000 } },
      includedType: 'restaurant',
      openNow: true,
      priceLevels: ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE'],
    })
    expect(calls[0].headers['X-Goog-FieldMask']).toBe(
      'places.id,places.displayName,places.formattedAddress,places.location,places.viewport,places.types,places.businessStatus,nextPageToken',
    )
    expect(res.data).toEqual({ status: 'OK', results: [{ place_id: 'a', name: 'A' }], html_attributions: [], next_page_token: 'next' })
  })

  it('placesNearby uses Nearby Search for a plain type search', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { places: [{ id: 'n' }] } }))
    const res = await new Client({ fetch }).placesNearby({
      params: { key, location: '18.5,73.8', radius: 800, type: 'cafe', rankby: 'prominence' },
    })
    expect(calls[0].url).toBe('https://places.googleapis.com/v1/places:searchNearby')
    expect(calls[0].body).toEqual({
      locationRestriction: { circle: { center: { latitude: 18.5, longitude: 73.8 }, radius: 800 } },
      includedTypes: ['cafe'],
      rankPreference: 'POPULARITY',
    })
    expect(calls[0].headers['X-Goog-FieldMask']).toBe(
      'places.id,places.displayName,places.shortFormattedAddress,places.location,places.viewport,places.types,places.businessStatus',
    )
    expect(res.data.results).toEqual([{ place_id: 'n' }])
  })

  it('placesNearby and textSearch take the first of several types, as the legacy API did', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { places: [] } }))
    const client = new Client({ fetch })
    const type = ['cafe', 'bakery'] as unknown as string
    await client.placesNearby({ params: { key, location: '18.5,73.8', radius: 800, type } })
    await client.textSearch({ params: { key, query: 'coffee', type: 'cafe|bakery' } })
    expect(calls[0].body.includedTypes).toEqual(['cafe'])
    expect(calls[1].body.includedType).toBe('cafe')
  })

  it('placesNearby with a keyword uses Text Search inside the circle', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { places: [], nextPageToken: 't' } }))
    const res = await new Client({ fetch }).placesNearby({
      params: { key, location: [0, 0], radius: 1113.2, keyword: 'vada pav', rankby: 'distance' },
    })
    expect(calls[0].url).toBe('https://places.googleapis.com/v1/places:searchText')
    // rankby=distance had no radius in the legacy API, so it searches the 50 km maximum
    expect(calls[0].body.textQuery).toBe('vada pav')
    expect(calls[0].body.rankPreference).toBe('DISTANCE')
    expect(calls[0].body.locationRestriction.rectangle.high.latitude).toBeCloseTo(50_000 / 111_320)
    expect(calls[0].headers['X-Goog-FieldMask']).toMatch(/,nextPageToken$/)
    expect(res.data).toMatchObject({ status: 'ZERO_RESULTS', next_page_token: 't' })
  })

  it('findPlaceFromText asks only for the fields given, default place_id', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { places: [{ id: 'f' }] } }))
    const client = new Client({ fetch })
    const res = await client.findPlaceFromText({
      params: { key, input: 'Aga Khan Palace', inputtype: 'textquery', locationbias: 'circle:2000@18.55,73.9' },
    })
    await client.findPlaceFromText({
      params: { key, input: 'x', inputtype: 'textquery', fields: ['name', 'formatted_address'], locationbias: 'rectangle:18,73|19,74' },
    })
    expect(calls[0].headers['X-Goog-FieldMask']).toBe('places.id')
    expect(calls[0].body).toEqual({
      textQuery: 'Aga Khan Palace',
      pageSize: 1,
      locationBias: { circle: { center: { latitude: 18.55, longitude: 73.9 }, radius: 2000 } },
    })
    expect(calls[1].headers['X-Goog-FieldMask']).toBe('places.displayName,places.formattedAddress')
    expect(calls[1].body.locationBias).toEqual({
      rectangle: { low: { latitude: 18, longitude: 73 }, high: { latitude: 19, longitude: 74 } },
    })
    expect(res.data).toEqual({ status: 'OK', candidates: [{ place_id: 'f' }] })
  })
})

const route = {
  description: 'NH48',
  warnings: ['This route has tolls.'],
  viewport: { low: { latitude: 18.5, longitude: 72.8 }, high: { latitude: 19.1, longitude: 73.9 } },
  polyline: { encodedPolyline: 'abc' },
  optimizedIntermediateWaypointIndex: [1, 0],
  legs: [0, 1, 2].map((i) => ({
    distanceMeters: 1000 * (i + 1),
    duration: `${700 + i}s`,
    staticDuration: `${600 + i}s`,
    startLocation: { latLng: { latitude: i, longitude: i } },
    endLocation: { latLng: { latitude: i + 1, longitude: i + 1 } },
    localizedValues: { distance: { text: `${i + 1} km` }, duration: { text: '12 mins' }, staticDuration: { text: '10 mins' } },
    steps:
      i === 0
        ? [
            {
              distanceMeters: 200,
              staticDuration: '40s',
              startLocation: { latLng: { latitude: 0, longitude: 0 } },
              endLocation: { latLng: { latitude: 0.1, longitude: 0.1 } },
              polyline: { encodedPolyline: 'st' },
              navigationInstruction: { maneuver: 'TURN_SLIGHT_LEFT', instructions: 'Turn slightly left onto FC Road' },
              localizedValues: { distance: { text: '0.2 km' }, staticDuration: { text: '1 min' } },
              travelMode: 'DRIVE',
            },
            { navigationInstruction: { maneuver: 'DEPART', instructions: 'Head north' }, travelMode: 'DRIVE' },
          ]
        : [],
  })),
}

describe('directions', () => {
  it('maps the request: waypoints, optimize, avoid, units and traffic', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { routes: [] } }))
    const res = await new Client({ fetch }).directions({
      params: {
        key,
        origin: 'Pune',
        destination: 'place_id:ChIJmumbai',
        waypoints: ['optimize:true', 'Lonavala', 'via:18.75,73.4', [18.9, 73.3]],
        mode: TravelMode.driving,
        avoid: [TravelRestriction.tolls, TravelRestriction.ferries],
        units: UnitSystem.metric,
        language: 'en',
        alternatives: true,
        departure_time: 'now',
      },
    })
    expect(calls[0].url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes')
    expect(calls[0].body).toEqual({
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      routeModifiers: { avoidTolls: true, avoidFerries: true },
      languageCode: 'en',
      units: 'METRIC',
      origin: { address: 'Pune' },
      destination: { placeId: 'ChIJmumbai' },
      intermediates: [
        { address: 'Lonavala' },
        { location: { latLng: { latitude: 18.75, longitude: 73.4 } }, via: true },
        { location: { latLng: { latitude: 18.9, longitude: 73.3 } } },
      ],
      computeAlternativeRoutes: true,
      optimizeWaypointOrder: true,
    })
    expect(calls[0].headers['X-Goog-FieldMask']).toContain('routes.legs.steps.navigationInstruction')
    expect(res.data).toEqual({ status: 'ZERO_RESULTS', routes: [], geocoded_waypoints: [], available_travel_modes: [] })
  })

  it('a future departure time is sent; walking ignores traffic; transit maps its options', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    const client = new Client({ fetch })
    const at = new Date('2030-01-01T09:00:00Z')
    await client.directions({ params: { key, origin: 'a', destination: 'b', departure_time: at, traffic_model: 'pessimistic' } })
    await client.directions({ params: { key, origin: 'a', destination: 'b', mode: 'walking', departure_time: at } })
    await client.directions({
      params: {
        key,
        origin: 'a',
        destination: 'b',
        mode: 'transit',
        arrival_time: 1893488400,
        transit_mode: ['bus', 'tram'],
        transit_routing_preference: 'less_walking',
      },
    })
    expect(calls[0].body).toMatchObject({
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      departureTime: '2030-01-01T09:00:00.000Z',
      trafficModel: 'PESSIMISTIC',
    })
    expect(calls[0].body.languageCode).toBe('en')
    expect(calls[1].body).not.toHaveProperty('routingPreference')
    expect(calls[1].body).not.toHaveProperty('departureTime')
    expect(calls[2].body).toMatchObject({
      travelMode: 'TRANSIT',
      arrivalTime: '2030-01-01T09:00:00.000Z',
      transitPreferences: { allowedTravelModes: ['BUS', 'LIGHT_RAIL'], routingPreference: 'LESS_WALKING' },
    })
  })

  it('times can be numeric strings or ISO dates, as the legacy client passed them through', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    const client = new Client({ fetch })
    await client.directions({ params: { key, origin: 'a', destination: 'b', departure_time: '1893488400' } })
    await client.directions({ params: { key, origin: 'a', destination: 'b', departure_time: '2030-01-01T09:00:00Z' } })
    const matrix = mockFetch(() => ({ body: [] }))
    await new Client({ fetch: matrix.fetch }).distancematrix({
      params: { key, origins: ['a'], destinations: ['b'], mode: 'transit', arrival_time: '1893488400' },
    })
    expect(calls[0].body.departureTime).toBe('2030-01-01T09:00:00.000Z')
    expect(calls[1].body.departureTime).toBe('2030-01-01T09:00:00.000Z')
    expect(matrix.calls[0].body.arrivalTime).toBe('2030-01-01T09:00:00.000Z')
    await expect(client.directions({ params: { key, origin: 'a', destination: 'b', departure_time: 'tomorrow' } })).rejects.toThrow(
      /Can't read "tomorrow" as a time/,
    )
  })

  it('avoid and transit_mode also work as "|" strings', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    const client = new Client({ fetch })
    await client.directions({ params: { key, origin: 'a', destination: 'b', avoid: 'tolls|ferries' as unknown as TravelRestriction[] } })
    await client.directions({
      params: { key, origin: 'a', destination: 'b', mode: 'transit', transit_mode: 'bus|rail' as unknown as string[] },
    })
    expect(calls[0].body.routeModifiers).toEqual({ avoidTolls: true, avoidFerries: true })
    expect(calls[1].body.transitPreferences).toEqual({ allowedTravelModes: ['BUS', 'RAIL'] })
  })

  it('returns routes in the legacy shape, with legs in the optimized order', async () => {
    const { fetch } = mockFetch(() => ({ body: { routes: [route] } }))
    const res = await new Client({ fetch }).directions({
      params: { key, origin: 'Pune', destination: 'Mumbai', waypoints: ['optimize:true', 'Lonavala', 'Khopoli'], departure_time: 'now' },
    })
    const r = res.data.routes[0]
    expect(res.data.status).toBe('OK')
    expect(r.summary).toBe('NH48')
    expect(r.warnings).toEqual(['This route has tolls.'])
    expect(r.overview_polyline).toEqual({ points: 'abc' })
    expect(r.bounds).toEqual({ northeast: { lat: 19.1, lng: 73.9 }, southwest: { lat: 18.5, lng: 72.8 } })
    expect(r.waypoint_order).toEqual([1, 0])
    expect(r.legs.map((l) => [l.start_address, l.end_address])).toEqual([
      ['Pune', 'Khopoli'],
      ['Khopoli', 'Lonavala'],
      ['Lonavala', 'Mumbai'],
    ])
    expect(r.legs[0]).toMatchObject({
      distance: { value: 1000, text: '1 km' },
      duration: { value: 600, text: '10 mins' },
      duration_in_traffic: { value: 700, text: '12 mins' },
      start_location: { lat: 0, lng: 0 },
      end_location: { lat: 1, lng: 1 },
    })
    expect(r.legs[0].steps).toEqual([
      {
        html_instructions: 'Turn slightly left onto FC Road',
        distance: { value: 200, text: '0.2 km' },
        duration: { value: 40, text: '1 min' },
        start_location: { lat: 0, lng: 0 },
        end_location: { lat: 0.1, lng: 0.1 },
        polyline: { points: 'st' },
        travel_mode: 'DRIVING',
        maneuver: 'turn-slight-left',
      },
      {
        html_instructions: 'Head north',
        distance: { value: 0, text: '0.0 km' },
        duration: { value: 0, text: '1 min' },
        start_location: { lat: 0, lng: 0 },
        end_location: { lat: 0, lng: 0 },
        polyline: { points: '' },
        travel_mode: 'DRIVING',
      },
    ])
  })

  it('without traffic there is no duration_in_traffic, and waypoint order is the given one', async () => {
    const { fetch } = mockFetch(() => ({ body: { routes: [{ ...route, optimizedIntermediateWaypointIndex: undefined }] } }))
    const res = await new Client({ fetch }).directions({
      params: { key, origin: 'Pune', destination: 'Mumbai', waypoints: ['Lonavala', 'Khopoli'] },
    })
    const r = res.data.routes[0]
    expect(r.waypoint_order).toEqual([0, 1])
    expect(r.legs[0]).not.toHaveProperty('duration_in_traffic')
    expect(r.legs.map((l) => l.end_address)).toEqual(['Lonavala', 'Khopoli', 'Mumbai'])
  })

  it('rejects encoded-polyline waypoints clearly', async () => {
    const client = new Client({ fetch: mockFetch().fetch })
    await expect(client.directions({ params: { key, origin: 'a', destination: 'b', waypoints: ['enc:abc:'] } })).rejects.toThrow('enc:')
  })
})

describe('distancematrix', () => {
  it('maps the request and fills the rows grid', async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: [
        // origin 0 / destination 0: indexes omitted, as Google's JSON does for 0
        {
          condition: 'ROUTE_EXISTS',
          distanceMeters: 150000,
          duration: '9000s',
          staticDuration: '8400s',
          localizedValues: {
            distance: { text: '150 km' },
            duration: { text: '2 hours 30 mins' },
            staticDuration: { text: '2 hours 20 mins' },
          },
        },
        { destinationIndex: 1, condition: 'ROUTE_NOT_FOUND' },
        { originIndex: 1, status: { code: 5, message: 'Waypoint not found' } },
        { originIndex: 7, destinationIndex: 0, condition: 'ROUTE_EXISTS' },
      ],
    }))
    const res = await new Client({ fetch }).distancematrix({
      params: {
        key,
        origins: ['Pune', { lat: 18.9, lng: 72.8 }],
        destinations: ['Mumbai', 'place_id:island'],
        avoid: ['highways'],
        departure_time: 'now',
        units: 'imperial',
      },
    })
    expect(calls[0].url).toBe('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix')
    expect(calls[0].body).toEqual({
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      languageCode: 'en',
      units: 'IMPERIAL',
      origins: [
        { waypoint: { address: 'Pune' }, routeModifiers: { avoidHighways: true } },
        { waypoint: { location: { latLng: { latitude: 18.9, longitude: 72.8 } } }, routeModifiers: { avoidHighways: true } },
      ],
      destinations: [{ waypoint: { address: 'Mumbai' } }, { waypoint: { placeId: 'island' } }],
    })
    expect(calls[0].headers['X-Goog-FieldMask']).toBe(
      'originIndex,destinationIndex,status,condition,distanceMeters,duration,staticDuration,localizedValues',
    )
    expect(res.data).toEqual({
      status: 'OK',
      origin_addresses: ['Pune', '18.9,72.8'],
      destination_addresses: ['Mumbai', ''],
      rows: [
        {
          elements: [
            {
              status: 'OK',
              distance: { value: 150000, text: '150 km' },
              duration: { value: 8400, text: '2 hours 20 mins' },
              duration_in_traffic: { value: 9000, text: '2 hours 30 mins' },
            },
            { status: 'ZERO_RESULTS' },
          ],
        },
        { elements: [{ status: 'NOT_FOUND' }, { status: 'NOT_FOUND' }] },
      ],
    })
  })
})

describe('APIs that are not legacy pass through unchanged', () => {
  it('geocode serialises params the legacy way and returns the body as is', async () => {
    const body = { status: 'OK', results: [{ place_id: 'g' }] }
    const { fetch, calls } = mockFetch(() => ({ body }))
    const res = await new Client({ fetch }).geocode({
      params: {
        key,
        address: 'FC Road',
        components: { country: 'IN', postal_code: '411004' },
        bounds: { northeast: { lat: 19, lng: 74 }, southwest: { lat: 18, lng: 73 } },
      },
    })
    expect(res.data).toEqual(body)
    expect(calls[0].url.split('?')[0]).toBe('https://maps.googleapis.com/maps/api/geocode/json')
    expect(query(calls[0].url)).toEqual({ address: 'FC Road', components: 'country:IN|postal_code:411004', bounds: '18,73|19,74', key })
  })

  it('reverseGeocode, elevation and timezone serialise coordinates, lists and dates', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { status: 'OK' } }))
    const client = new Client({ fetch })
    await client.reverseGeocode({ params: { key, latlng: { latitude: 18.5, longitude: 73.8 }, result_type: ['street_address', 'route'] } })
    await client.elevation({ params: { key, locations: [[18.5, 73.8], '19,72.8'] } })
    await client.timezone({ params: { key, location: [18.5, 73.8], timestamp: new Date('2026-01-01T00:00:00Z') } })
    expect(query(calls[0].url)).toMatchObject({ latlng: '18.5,73.8', result_type: 'street_address|route' })
    expect(calls[1].url).toContain('https://maps.googleapis.com/maps/api/elevation/json?')
    expect(query(calls[1].url)).toMatchObject({ locations: '18.5,73.8|19,72.8' })
    expect(query(calls[2].url)).toMatchObject({ location: '18.5,73.8', timestamp: '1767225600' })
  })

  it('geolocate posts its data; roads take paths', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { location: { lat: 1, lng: 2 }, accuracy: 20 } }))
    const client = new Client({ fetch })
    const res = await client.geolocate({ params: { key }, data: { considerIp: true } })
    await client.snapToRoads({
      params: {
        key,
        path: [
          [1, 2],
          [3, 4],
        ],
        interpolate: true,
      },
    })
    expect(res.data).toEqual({ location: { lat: 1, lng: 2 }, accuracy: 20 })
    expect(calls[0]).toMatchObject({ method: 'POST', body: { considerIp: true } })
    expect(calls[0].url).toBe(`https://www.googleapis.com/geolocation/v1/geolocate?key=${key}`)
    expect(query(calls[1].url)).toEqual({ path: '1,2|3,4', interpolate: 'true', key })
  })

  it('an HTTP error from a passthrough API resolves with a legacy status, like the other methods', async () => {
    const { fetch } = mockFetch(() => googleError(400, 'INVALID_ARGUMENT', 'Invalid path'))
    const res = await new Client({ fetch }).snapToRoads({ params: { key, path: ['x'] } })
    expect(res.status).toBe(400)
    expect(res.data).toEqual({ snappedPoints: [], status: Status.INVALID_REQUEST, error_message: 'Invalid path' })
  })

  it('a network error from a passthrough API still throws', async () => {
    const { fetch } = mockFetch(() => new Error('socket hang up'))
    const error = await new Client({ fetch, config: { retries: 0 } }).geocode({ params: { key, address: 'x' } }).catch((e) => e)
    expect(error).toBeInstanceOf(MapsError)
    expect(error.code).toBe('NETWORK_ERROR')
  })
})

describe('placePhoto', () => {
  it('downloads the image for a new photo name and returns an ArrayBuffer', async () => {
    const { fetch, calls } = mockFetch((call) =>
      call.url.startsWith('https://places.googleapis.com')
        ? { body: { photoUri: 'https://lh3.googleusercontent.com/p/x' } }
        : { body: 'JPEGDATA' },
    )
    const res = await new Client({ fetch }).placePhoto({
      params: { key, photoreference: 'places/a/photos/b', maxwidth: 400 },
      responseType: 'arraybuffer',
    } as never)
    expect(query(calls[0].url)).toEqual({ maxWidthPx: '400', skipHttpRedirect: 'true' })
    expect(calls[1].url).toBe('https://lh3.googleusercontent.com/p/x')
    expect(res.data).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(res.data)).toBe('JPEGDATA')
  })

  it('explains that legacy photo references need the new photo name', async () => {
    const client = new Client({ fetch: mockFetch().fetch })
    await expect(client.placePhoto({ params: { key, photoreference: 'AeJbb3old' } })).rejects.toThrow('Places API (New) photo name')
  })
})

describe('client', () => {
  it('needs a key in params', async () => {
    const client = new Client({ fetch: mockFetch().fetch })
    await expect(client.placeAutocomplete({ params: { input: 'x' } } as never)).rejects.toThrow('params.key is required')
  })

  it('sends the experience id header and applies config', async () => {
    const { fetch, calls } = mockFetch()
    const client = new Client({ fetch, experienceId: ['a'], config: { headers: { 'X-Extra': '1' } } })
    await client.placeDetails({ params: { key, place_id: 'p' } })
    client.setExperienceId('b', 'c')
    await client.placeDetails({ params: { key, place_id: 'p' } })
    expect(client.getExperienceId()).toEqual(['b', 'c'])
    client.clearExperienceId()
    await client.placeDetails({ params: { key, place_id: 'p' } })
    expect(calls[0].headers).toMatchObject({ 'X-GOOG-MAPS-EXPERIENCE-ID': 'a', 'X-Extra': '1' })
    expect(calls[1].headers['X-GOOG-MAPS-EXPERIENCE-ID']).toBe('b,c')
    expect(calls[2].headers).not.toHaveProperty('X-GOOG-MAPS-EXPERIENCE-ID')
  })

  it('code written for the legacy client runs unchanged', async () => {
    const { fetch } = mockFetch((call) => {
      if (call.url.includes('autocomplete')) return { body: { suggestions: [puneSuggestion] } }
      if (call.url.includes('/places/')) return { body: fullPlace }
      return { body: { routes: [route] } }
    })
    // the usual pattern from the legacy README, with only the import changed
    const client = new Client({ fetch })
    const auto = await client.placeAutocomplete({ params: { input: 'Pun', key }, timeout: 1000 })
    const placeId = auto.data.predictions[0].place_id
    const details = await client.placeDetails({ params: { place_id: placeId, fields: ['name', 'geometry'], key } })
    const { lat, lng } = details.data.result.geometry!.location
    const dir = await client.directions({ params: { origin: { lat, lng }, destination: 'Mumbai', mode: TravelMode.driving, key } })
    expect(auto.data.status).toBe(Status.OK)
    expect(details.data.result.name).toBe('Vaishali')
    expect(dir.data.routes[0].legs[0].distance.text).toBe('1 km')
  })
})

describe('paging with only a pagetoken', () => {
  it('textSearch replays the request that issued the token', async () => {
    const { fetch, calls } = mockFetch((_, i) =>
      i === 0 ? { body: { places: [{ id: 'a' }], nextPageToken: 'tok1' } } : { body: { places: [{ id: 'b' }] } },
    )
    const client = new Client({ fetch })
    const first = await client.textSearch({ params: { key, query: 'misal in Pune', region: 'in', opennow: true } })
    expect(first.data.next_page_token).toBe('tok1')
    const second = await client.textSearch({ params: { key, pagetoken: 'tok1' } })
    expect(second.data.status).toBe(Status.OK)
    expect(second.data.results[0].place_id).toBe('b')
    expect(calls[1].body).toEqual({ textQuery: 'misal in Pune', regionCode: 'in', openNow: true, pageToken: 'tok1' })
  })

  it('placesNearby replays the text search behind a keyword search', async () => {
    const { fetch, calls } = mockFetch((_, i) =>
      i === 0 ? { body: { places: [{ id: 'a' }], nextPageToken: 'tok2' } } : { body: { places: [] } },
    )
    const client = new Client({ fetch })
    await client.placesNearby({ params: { key, location: [18.52, 73.85], radius: 500, keyword: 'cafe' } })
    const page = await client.placesNearby({ params: { key, pagetoken: 'tok2' } as never })
    expect(page.data.status).toBe(Status.ZERO_RESULTS)
    expect(calls[1].body.textQuery).toBe('cafe')
    expect(calls[1].body.pageToken).toBe('tok2')
    expect(calls[1].body.locationRestriction).toBeDefined()
  })

  it('a token this client did not issue resolves INVALID_REQUEST when there is nothing else to go on', async () => {
    const { fetch } = mockFetch()
    const res = await new Client({ fetch }).placesNearby({ params: { key, pagetoken: 'stranger' } as never })
    expect(res.data.status).toBe(Status.INVALID_REQUEST)
    expect(res.data.error_message).toMatch(/pagetoken/)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('legacy names', () => {
  it('exports the enums the legacy client did', () => {
    expect(Language.en).toBe('en')
    expect(PlaceType1.restaurant).toBe('restaurant')
    expect(PlaceType2.locality).toBe('locality')
    expect(AddressType.street_address).toBe('street_address')
    expect(TransitRoutingPreference.less_walking).toBe('less_walking')
    expect(Maneuver.turn_left).toBe('turn-left')
    expect(DirectionsReponseStatus.OK).toBe('OK')
  })

  it('accepts fields as a comma string, and maps the ones with new names', async () => {
    const { fetch, calls } = mockFetch(() => ({ body: {} }))
    await new Client({ fetch }).placeDetails({
      params: { key, place_id: 'p', fields: 'name, secondary_opening_hours,wheelchair_accessible_entrance,scope,icon' as never },
    })
    expect(calls[0].headers['X-Goog-FieldMask']).toBe(
      'displayName,regularSecondaryOpeningHours,currentSecondaryOpeningHours,accessibilityOptions,iconMaskBaseUri',
    )
  })

  it('maps secondary hours, wheelchair access and the icon back', async () => {
    const { fetch } = mockFetch(() => ({
      body: {
        iconMaskBaseUri: 'https://maps.gstatic.com/mapfiles/place_api/icons/v2/cafe_pinlet',
        accessibilityOptions: { wheelchairAccessibleEntrance: true },
        regularSecondaryOpeningHours: [
          {
            secondaryHoursType: 'DRIVE_THROUGH',
            periods: [{ open: { day: 1, hour: 7, minute: 0 } }],
            weekdayDescriptions: ['Monday: 7 AM'],
          },
        ],
      },
    }))
    const { data } = await new Client({ fetch }).placeDetails({ params: { key, place_id: 'p', fields: ['icon'] } })
    expect(data.result.icon).toBe('https://maps.gstatic.com/mapfiles/place_api/icons/v2/cafe_pinlet.png')
    expect(data.result.wheelchair_accessible_entrance).toBe(true)
    expect(data.result.secondary_opening_hours).toEqual([
      { type: 'DRIVE_THROUGH', periods: [{ open: { day: 1, time: '0700' } }], weekday_text: ['Monday: 7 AM'] },
    ])
  })

  it('coordinates show up as "lat,lng" in directions addresses, place IDs as ""', async () => {
    const { fetch } = mockFetch(() => ({
      body: {
        routes: [
          {
            legs: [
              { distanceMeters: 1, staticDuration: '1s' },
              { distanceMeters: 1, staticDuration: '1s' },
            ],
          },
        ],
      },
    }))
    const { data } = await new Client({ fetch }).directions({
      params: { key, origin: { lat: 18.52, lng: 73.85 }, destination: 'place_id:abc', waypoints: ['FC Road, Pune'] },
    })
    expect(data.routes[0].legs.map((l) => [l.start_address, l.end_address])).toEqual([
      ['18.52,73.85', 'FC Road, Pune'],
      ['FC Road, Pune', ''],
    ])
  })
})
