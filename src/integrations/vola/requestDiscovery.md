# Vola.ro Request Discovery

> **Last verified**: 2026-03-14 via browser network traffic capture on vola.ro

## API Host

The vola.ro frontend does **not** call vola.ro backend directly. All flight data requests go to:

```
https://api.ith.toys
```

This is a third-party travel aggregation gateway used by vola.ro as their underlying data provider.

---

## Required Headers (VERIFIED)

Every request to `api.ith.toys` requires these headers:

| Header | Value | Notes |
|---|---|---|
| `api-key` | `7f6c921c-d7f8-4303-b9ad-b60878ca12ed` | Static frontend key. Visible in JS bundle. |
| `x-affiliate` | `vola` | Identifies the vola.ro affiliate context. |
| `x-app-origin` | `new-front-end` | Identifies the caller. |
| `slot` | `volaNoExtraViFeesIncreased` | Influences fee calculation logic. |
| `Content-Type` | `application/json` | For POST requests. |
| `Accept` | `application/json` | Standard. |

Optional/observed but not confirmed required:
- `x-ab-test-token`: Long encoded string, appears session-scoped. May be tied to frontend deployment. Not yet confirmed as required for API access.

---

## Endpoint 1: Autocomplete

Resolves city/airport names to location codes.

```
GET https://api.ith.toys/gateway/public/autocomplete
```

**Query Parameters**:
| Param | Example | Description |
|---|---|---|
| `searchTerm` | `London` | User text to search |
| `lang` | `ro` or `en` | Language for results |
| `searchFor` | `ORIGIN` or `DESTINATION` | Context of search |
| `selectedOrigins` | `BUH` | Already-selected origin code |
| `limit` | `4` | Max results |

**Response** (verified):
Returns an array of location objects:
```json
[
  {
    "code": "LON",
    "type": "CITY",
    "name": "Londra",
    "country": "Marea Britanie",
    "countryCode": "GB",
    "airports": [
      { "code": "LHR", "name": "London Heathrow" },
      { "code": "LGW", "name": "London Gatwick" },
      { "code": "STN", "name": "London Stansted" },
      { "code": "LTN", "name": "London Luton" }
    ]
  }
]
```

**Notes**: Uses city-level codes (`LON`, `BUH`) not individual airport codes (`LHR`, `OTP`). The API prefers city aggregation with `type: "CITY"`.

---

## Endpoint 2: Search Initiation (VERIFIED — PRIMARY)

Starts a new flight search session.

```
POST https://api.ith.toys/gateway/discover
```

**Request Body** (verified exact shape):
```json
{
  "dates": {
    "departureFrom": "2026-04-15",
    "departureTo": "2026-04-15",
    "returnFrom": "2026-04-19",
    "returnTo": "2026-04-19"
  },
  "passengers": {
    "adults": 1,
    "children": 0,
    "infants": 0,
    "youth": 0
  },
  "locations": {
    "origins": [
      { "code": "BUH", "type": "CITY" }
    ],
    "destinations": [
      { "code": "LON", "type": "CITY" }
    ]
  },
  "luggageOptions": {
    "personalItemCount": 1,
    "cabinTrolleyCount": 0,
    "checkedBaggageCount": 0
  }
}
```

**Response** (verified):
```json
{
  "discoveryId": "bc39f63c-fedb-4853-9c36-39333a25b6d6"
}
```

**Notes**:
- `departureFrom` / `departureTo` allow date ranges for flexible searches. Set both to the same date for an exact date.
- Same pattern for `returnFrom` / `returnTo`.
- For one-way, omit `returnFrom` and `returnTo` (or set to `null` — needs verification).
- Location codes use city codes (`BUH` for Bucharest, `LON` for London), not individual airports.
- `luggageOptions.personalItemCount: 1` is the default (hand baggage).

---

## Endpoint 3: Result Polling (VERIFIED — PRIMARY)

Polls progressive search results by `discoveryId`.

```
GET https://api.ith.toys/gateway/discover/fetch/{discoveryId}
```

**Polling Behavior**:
- Client polls every ~1-2 seconds
- Response has `status`: either `"IN_PROGRESS"` or `"COMPLETED"`
- Results arrive progressively — partial results are available during `IN_PROGRESS`
- Typical completion time: 5-15 seconds

**Response Structure** (verified):
```json
{
  "status": "COMPLETED",
  "offersResult": {
    "offers": [
      {
        "id": "offer-uuid",
        "stages": [
          {
            "segments": [
              {
                "departure": {
                  "dateTime": "2026-04-15T06:30:00",
                  "airport": { "code": "OTP", "name": "Bucharest Henri Coandă" }
                },
                "arrival": {
                  "dateTime": "2026-04-15T09:50:00",
                  "airport": { "code": "LTN", "name": "London Luton" }
                },
                "carrier": {
                  "code": "W6",
                  "name": "Wizz Air"
                },
                "flightNumber": "W6 3201",
                "duration": "PT3H20M"
              }
            ]
          },
          {
            "segments": [
              {
                "departure": {
                  "dateTime": "2026-04-19T10:15:00",
                  "airport": { "code": "LTN", "name": "London Luton" }
                },
                "arrival": {
                  "dateTime": "2026-04-19T15:30:00",
                  "airport": { "code": "OTP", "name": "Bucharest Henri Coandă" }
                },
                "carrier": {
                  "code": "W6",
                  "name": "Wizz Air"
                },
                "flightNumber": "W6 3202",
                "duration": "PT3H15M"
              }
            ]
          }
        ],
        "tickets": [
          {
            "totalPrice": {
              "amount": 89.99,
              "currency": "EUR"
            },
            "fees": {
              "transactionFee": {
                "amount": 12.00,
                "currency": "EUR"
              }
            }
          }
        ]
      }
    ]
  }
}
```

**Key Structure Notes**:
- `stages[0]` = outbound leg, `stages[1]` = return leg (if round trip)
- Each stage has `segments[]` — multiple segments = connecting flights (stops)
- 1 segment = direct flight
- `tickets[0].totalPrice` = base price
- `tickets[0].fees.transactionFee` = additional platform fee
- **User-facing price = `totalPrice.amount + transactionFee.amount`**
- `carrier.code` is the IATA airline code
- `duration` is ISO 8601 duration format

---

## One-Way Search

For one-way flights, the `dates` object should omit return fields:
```json
{
  "dates": {
    "departureFrom": "2026-04-15",
    "departureTo": "2026-04-15"
  }
}
```

> ⚠️ **UNVERIFIED**: The exact one-way payload has not been tested. The above is an educated assumption based on the round-trip structure. May need `returnFrom: null` or complete omission of the return fields.

---

## Deep Links

Vola.ro search result URLs follow this pattern:
```
https://www.vola.ro/bilete-avion/{origin}-{destination}?from={date}&to={date}&adults=1
```

Example:
```
https://www.vola.ro/bilete-avion/bucuresti-londra?from=2026-04-15&to=2026-04-19&adults=1
```

---

## Fragility Points & Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `api-key` rotates | **HIGH** | Key is in the frontend JS bundle. Rotation would break all calls. Monitor and re-extract if needed. |
| `x-ab-test-token` becomes mandatory | **MEDIUM** | Currently appears optional. If enforced, would need Playwright to extract from a fresh page load. |
| Rate limiting / IP blocking | **MEDIUM** | Use conservative polling (2s intervals), add delays between searches. |
| Response schema changes | **LOW-MEDIUM** | Structure looks stable (established API). Normalize defensively with fallbacks. |
| CAPTCHA on the gateway | **LOW** | Not observed on API calls. Only risk with very aggressive usage. |
| `api.ith.toys` domain changes | **LOW** | Owned by the same infrastructure. Monitor via periodic health checks. |

---

## Assumptions

1. The `api-key` is a public frontend key, not a secret. It's embedded in the vola.ro JS bundle.
2. No user authentication is required for flight search.
3. City-level codes are preferred over airport codes (the API accepts both, but the frontend uses city codes).
4. Polling is the only way to get results — there is no WebSocket or Server-Sent Events channel.
5. The API supports CORS and can be called from any origin (as it serves the vola.ro SPA).
