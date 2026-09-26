# Firepoint: API Scope and Roadmap

This document lists the external APIs Firepoint depends on, the API our own backend exposes, the core architecture, and a phased plan to get from a map of official alerts to a full preparedness app. Everything here is **proposed**, not built. See [vision.md](vision.md) for the product features and [contracts.md](contracts.md) for the schemas and routes that exist today.

---

## 1. What "prediction" means for each hazard

This choice drives the architecture and our liability, so it comes first:

| Hazard | Can it actually be predicted? | What the app should promise |
|---|---|---|
| Wildfire | Fire *weather* can be forecast 1–7 days out. Spread from a fire that's already burning can be modeled. | Risk scores plus projected spread |
| Heat, air quality/smoke | Yes, forecasts are good | Forecast-driven alerts |
| Flood, post-fire debris flows | Yes, from rainfall forecasts and burn-scar thresholds | Threshold alerts |
| Earthquake | **No.** Nobody can predict earthquakes. | Preparedness, aftershock forecasts, fast relay of quakes that already happened |

Firepoint is framed as **risk forecasting plus official-alert aggregation**, not "we predict disasters." It always links to the official alert systems (Alert LA County, Genasys Protect, WEA) and states that it doesn't replace them.

---

## 2. External APIs by category

### A. Official alerts (build these first)
| API | Use | Cost/Auth |
|---|---|---|
| **NWS API** (`api.weather.gov/alerts`) | Red Flag Warnings, heat, flood, wind alerts. Accepts point and zone queries. **Adapter already implemented** (`src/server/nws.ts`). | Free, needs a `User-Agent` header |
| **FEMA IPAWS-OPEN public feed** | All public alerts issued through the national IPAWS system, in CAP format | Free |
| **USGS Earthquake GeoJSON feeds** + FDSN event API | Quakes shortly after they happen | Free |
| **USGS Aftershock Forecast** (from the event detail product) | Aftershock probabilities | Free |
| **tsunami.gov CAP/Atom feeds** | Coastal users | Free |
| **Glendale MCP server** | City data and systems | Details TBD |

**About ShakeAlert (earthquake early warning):** it can't be consumed directly without becoming a licensed technical partner through USGS. Plan for that later, or point users to MyShake.

### B. Wildfire
| API | Use |
|---|---|
| **NASA FIRMS** | Satellite hotspots from VIIRS/MODIS, near real time. Free `MAP_KEY`. |
| **NIFC / WFIGS (ArcGIS REST)** | Official incident locations and perimeters |
| **CAL FIRE incidents** (public JSON behind their incidents page; unofficial) | California incident details, containment |
| **Synoptic Data API** (RAWS/MesoWest stations) | Live wind, gusts, humidity, fuel moisture. Critical for Santa Ana events. |
| **NWS gridpoint forecasts** / **Open-Meteo** | Hourly wind and RH forecasts to feed a fire-weather index |
| **LANDFIRE** (fuels) + **USGS 3DEP** (elevation) | Static inputs for fire-spread modeling |
| **CAL FIRE Fire Hazard Severity Zones** (GIS layer) | Static baseline risk for each address |

### C. Flood, debris flow, and water
| API | Use |
|---|---|
| **FEMA NFHL** (flood zones, ArcGIS) | Baseline flood risk for each address |
| **USGS Post-Fire Debris-Flow Hazard Assessments** | Very relevant to the Glendale foothills (Station Fire history) |
| **NOAA NWPS / USGS Water Services** | River gauges and flood forecasts |
| **NWS QPF (rainfall forecast)** | Compare against burn-scar rainfall thresholds |

### D. Air quality and heat
- **AirNow API** for official AQI forecasts and observations (free key)
- **PurpleAir API** for dense, hyperlocal smoke readings (paid points)
- **NWS HeatRisk** plus heat alerts

### E. Static baseline risk (each user's "address risk profile")
- **FEMA National Risk Index** (by census tract)
- **USGS Quaternary Faults** and **California Geological Survey liquefaction/landslide zones**
- The fire hazard and flood layers listed above

### F. Evacuation, shelters, and routing
- **Genasys Protect evacuation zones** (LA County uses them; public zone layers exist). Tell users their zone ID, because that's what officials announce.
- **FEMA Open Shelters** (National Shelter System on ArcGIS)
- **Mapbox Directions** or self-hosted **OSRM** for evacuation routes, avoiding fire perimeters

### G. Maps and geocoding
- **Mapbox GL / MapLibre**, with 3D terrain where useful
- **Mapbox or Google geocoding**; the **US Census Geocoder** is a free fallback

### H. Notifications and accessibility
| Channel | API | Notes |
|---|---|---|
| Web Push | **Web Push protocol + VAPID** (`web-push` library) or **Firebase Cloud Messaging** | Free. On iOS it only works once the PWA is installed to the home screen (iOS 16.4+). |
| SMS | **Twilio** | Costs money and requires A2P 10DLC registration. Reserve it for severe alerts. |
| Email | **Resend / SendGrid / Postmark** | Digests and lower-priority alerts |
| All-in-one | **OneSignal** | Faster to set up, less control |
| Voice | **ElevenLabs** text-to-speech | Alerts and instructions read aloud for seniors and kids |

### I. Platform
- **Auth:** Supabase Auth, Clerk, or Firebase Auth
- **Database:** **Postgres + PostGIS**. The core query is "which users' locations fall inside this alert polygon" (`ST_Intersects`).
- **Jobs:** cron/worker pollers (BullMQ, Celery, or Supabase/Cloud scheduled functions)
- **LLM (optional):** for personalized preparedness plans. Ground it in Ready.gov and CAL FIRE guidance, and never let it write alert text.

---

## 3. Firepoint's own backend API

Only `POST /api/v1/notices/query` exists today. The rest is proposed.

```
Auth / Users
  POST   /auth/*                     (delegate to provider)
  GET    /me                         profile, household info (pets, meds, mobility, vehicles)
  PATCH  /me

Locations
  GET    /locations                  home, work, family members' addresses
  POST   /locations                  geocode → store point + evac zone + static risk
  DELETE /locations/:id

Risk
  GET    /risk?lat=&lng=             current composite risk + per-hazard breakdown
  GET    /risk/forecast?lat=&lng=    next 7 days per hazard
  GET    /risk/profile/:locationId   static baseline (FHSZ, flood zone, fault distance, NRI)

Hazards / Events
  GET    /events?bbox=               active normalized events (fires, quakes, alerts) for the map
  GET    /events/:id                 detail + perimeter + projected spread
  GET    /events/:id/spread          fire-spread model output (GeoJSON by time step)

Community reports
  POST   /reports                    submit a report (type, photo, location)
  GET    /reports?bbox=              reports with verification status
  PATCH  /reports/:id                moderation (verify / reject)

Notifications
  POST   /push/subscribe             store Web Push subscription
  GET    /notifications              history
  PATCH  /notification-prefs         channels, thresholds, quiet hours (severe alerts ignore quiet hours)

Preparedness
  GET    /checklists                 go-bag, home hardening, per-hazard
  PATCH  /checklists/:id/items/:id   progress tracking
  GET    /plan                       household emergency plan (meeting points, contacts)
  GET    /shelters?lat=&lng=
  GET    /evac-route?locationId=

Admin / Internal
  POST   /internal/ingest/:source    triggered by schedulers
  GET    /health/sources             freshness of each feed (critical: stale data = danger)
```

---

## 4. Core architecture

```
[Feed pollers] ──► [Normalizer] ──► hazard_events (PostGIS)
  NWS, IPAWS,        common schema:        │
  USGS, FIRMS,       type, severity,       ▼
  NIFC, AirNow,      geometry, source,  [Matcher] ST_Intersects(user_locations, event.geom)
  Synoptic,          expires_at            │
  Glendale MCP                             ▼
                                     [Dispatcher] dedupe → throttle → tier → channel
[Risk engine] ──► risk_scores             (Web Push / SMS / email / voice)
  fire weather index,
  debris-flow thresholds,
  fire-spread model
```

Design rules that matter:
- **Dedupe across sources.** The same fire will show up in FIRMS, NIFC, CAL FIRE, and an NWS alert. Cluster them into one event so users get one notification.
- **Severity tiers:** *Info* (in-app only) → *Watch* (push) → *Warning* (push + SMS) → *Evacuation* (every channel, ignores quiet hours).
- **Track feed freshness.** If NWS polling silently dies, users think they're safe. Alert the team when a feed goes stale.
- **Poll intervals:** NWS/IPAWS every 1–2 minutes, USGS every 1 minute, FIRMS every 5–10 minutes, weather every 15–60 minutes.

---

## 5. Phased roadmap

**Phase 0: Foundation (done in part)**
- Next.js PWA foundation, NWS adapter, source policy and contracts are in place
- Still to do: database choice (Postgres/PostGIS), the normalized `hazard_event` schema, Glendale MCP access, and the Glenoaks Canyon boundary

**Phase 1: Read-only hazard map MVP (2–3 weeks)**
- Wire the UI to the NWS route; ingest USGS quakes, FIRMS, and NIFC perimeters
- Enter an address and see active hazards, official alerts, and a static risk profile
- No accounts yet. This validates the data pipeline.

**Phase 2: Accounts and real-time notifications (3–4 weeks)**
- Auth, saved locations, Web Push, and email
- The matcher and dispatcher with dedupe and tiers
- A notification preferences UI and a history page

**Phase 3: Risk forecasting (4–6 weeks)**
- A fire-weather risk score from Synoptic + NWS forecasts (wind, RH, fuel moisture, plus the FHSZ baseline)
- Projected spread on active fires near users
- Debris-flow alerts (burn scar + rainfall forecast), heat, and AQI/smoke
- A 7-day risk outlook per location
- Validate against past events, e.g. the Jan 2025 Eaton/Palisades fires and the Station Fire

**Phase 4: Preparedness and community (4–6 weeks)**
- Checklists that adapt to the user's risk profile: a go-bag plus hazard-specific tasks
- A household plan: contacts, meeting points, pets, meds, mobility needs
- The user's evacuation zone, nearest shelters, and evacuation routes that avoid perimeters
- Community reports with verification and moderation; neighbor check-ins
- Readiness nudges ("Red Flag Warning Thursday, is your go-bag ready?")

**Phase 5: Accessibility, hardening, and scale**
- ElevenLabs voice alerts, Simple Mode, Kid Mode
- Languages: **Armenian and Spanish** first (large Glendale communities), plus accessibility (WCAG)
- SMS via Twilio for high-severity tiers
- Offline PWA: a cached plan, checklist, and last-known map for when networks go down
- Monitoring, load testing (alert spikes during events), and expanding citywide, then to other regions
- Explore becoming a ShakeAlert licensed partner

---

## 6. Risks to plan for
- **Liability:** show clear disclaimers, and never phrase anything as an evacuation order unless it relays an official one
- **Alert fatigue:** tune thresholds, or users will turn notifications off
- **Unofficial endpoints** like CAL FIRE's JSON can break without notice; wrap them with fallbacks
- **Community report misinformation:** keep reports visually separate from official data, and require corroboration or moderation before amplifying them
- **SMS costs and carrier registration** take weeks, so start early if SMS is needed
- **Privacy:** home addresses and household medical info are sensitive; encrypt them and collect as little as possible
