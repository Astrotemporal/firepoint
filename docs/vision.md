# Firepoint Product Vision

> **Status: proposed.** This describes where Firepoint is headed, not what is built today. See the main [README](../README.md) for current status and [roadmap.md](roadmap.md) for the API scope and phased plan.

**Neighborhood-first emergency preparedness and live information for Glendale, CA.**

Firepoint helps residents get ready for emergencies (wildfire first) and stay informed while one is happening. It pulls official data, the City of Glendale's own systems, and verified reports from neighbors into one simple, accessible app. We're launching in a single Glendale neighborhood and will expand to the rest of Glendale and other communities later.

> ⚠️ Firepoint supplements official emergency alerts. It does not replace them. Always follow instructions from Glendale Fire, Glendale Police, LA County, and Wireless Emergency Alerts (WEA). Sign up for official alerts at [Alert LA County](https://ready.lacounty.gov/emergency-notifications/) and [Genasys Protect](https://protect.genasys.com/).

---

## Why

In wildfire-prone neighborhoods like the foothills around the Verdugo Mountains, critical information is scattered across agency websites, social media, and word of mouth. The people who need it most, including seniors, kids, people with disabilities, and non-English speakers, often have the hardest time finding and acting on it. Firepoint puts the relevant information for *your street* in one place, in a form everyone can use.

## Core features

### 1. Emergency preparedness
- A personalized household plan: contacts, meeting points, pets, medications, mobility needs
- Go-bag and home-hardening checklists that track progress
- Your evacuation zone, primary and alternate evacuation routes, and nearest shelters
- Seasonal and forecast-driven reminders (e.g. "Red Flag Warning Thursday, is your go-bag ready?")

### 2. Live emergency information
- Active fires, perimeters, and incident status near you
- Evacuation orders and warnings for your zone
- Weather that affects fire risk: wind, humidity, Red Flag Warnings
- Air quality and smoke
- Road closures and shelter openings
- Real-time notifications through Web Push, with SMS and email planned

### 3. Crowdsourced community updates
- Residents can report smoke, fire, downed lines, blocked roads, and people who need help
- Photo and location attachments
- Verification pipeline: reports are labeled **Unverified**, **Corroborated** (confirmed by multiple nearby reports), or **Confirmed** (matched to official data or a moderator)
- Clear visual separation between official information and community reports
- Neighbor check-ins ("I'm safe" / "I need help") so neighbors can look out for each other

### 4. Accessibility for seniors and kids
- Voice-first experience powered by **ElevenLabs**: alerts and instructions read aloud in a calm, clear voice
- Large-text, high-contrast "Simple Mode" with one-tap actions
- Kid-friendly mode with plain-language explanations, illustrated guidance, and preparedness activities
- Multilingual support, prioritizing **English, Armenian, Spanish, Korean, and Tagalog**, which reflect Glendale's communities
- Caregiver linking: family members can receive alerts on behalf of an elderly relative

### 5. City of Glendale integration (MCP)
- Integrates with the **Glendale MCP server** to read city data and connect with the city's own systems
- Planned uses: official city notices, evacuation zone data, shelter and resource status, and forwarding verified community reports to city staff

## Pilot area

- **Launch neighborhood:** Glenoaks Canyon
- **Expansion path:** pilot neighborhood → citywide Glendale → neighboring foothill communities (La Crescenta, La Cañada Flintridge, Burbank, Pasadena/Altadena) → other regions

## Data sources

| Source | Data |
|---|---|
| Glendale MCP server | City data and systems (details TBD) |
| NWS API (`api.weather.gov`) | Red Flag Warnings, wind, heat, and flood alerts |
| FEMA IPAWS-OPEN | Official public alerts (CAP) |
| NASA FIRMS | Satellite fire hotspots |
| NIFC / WFIGS, CAL FIRE | Wildfire incidents and perimeters |
| Synoptic Data (RAWS) | Live wind, gusts, humidity |
| AirNow / PurpleAir | Air quality and smoke |
| USGS | Earthquakes, post-fire debris-flow hazards |
| Genasys Protect zones | Evacuation zones |
| FEMA Open Shelters | Shelter locations and status |
| Community reports | Crowdsourced observations (moderated) |

Before any of these is shown in the app, it must pass the checks in [source-policy.md](source-policy.md).

## Architecture (planned)

```
 Official feeds ─┐
 Glendale MCP ───┼─► Ingest + normalize ─► Postgres / PostGIS ─► Matcher (who is affected?)
 Community ──────┘         │                      │                       │
 reports                   ▼                      ▼                       ▼
                   Verification &          Web app / PWA API       Notification dispatcher
                   moderation queue        (map, plan, reports)    (push, SMS, email, voice)
                                                                          │
                                                                   ElevenLabs TTS
```

- **Frontend:** Progressive Web App (installable, works offline for plans and checklists), map-centric UI
- **Backend:** API service + background workers that poll the feeds
- **Database:** Postgres + PostGIS for geospatial matching ("is this user inside this evacuation zone?")
- **Integrations:** Glendale MCP server, ElevenLabs, Web Push / Twilio / email provider

_The stack isn't final. The current foundation uses Next.js; see [roadmap.md](roadmap.md)._

## Roadmap

- [ ] **Phase 0: Foundation.** Repo setup, stack decision, Glendale MCP access, pilot neighborhood boundary
- [ ] **Phase 1: Live info MVP.** Map of official alerts, fires, and weather for the pilot area; address lookup
- [ ] **Phase 2: Accounts and notifications.** Saved addresses, Web Push alerts, notification preferences
- [ ] **Phase 3: Preparedness.** Household plan, checklists, evacuation zone, routes, shelters
- [ ] **Phase 4: Community reports.** Reporting, verification, moderation, neighbor check-ins
- [ ] **Phase 5: Accessibility.** ElevenLabs voice alerts, Simple Mode, Kid Mode, multilingual support
- [ ] **Phase 6: Scale.** Citywide Glendale rollout, then other locations

## Safety and privacy principles

- Official information always comes first and is visually distinct from community reports.
- Firepoint never issues evacuation orders. It relays official ones.
- Collect as little personal data as possible; encrypt household and medical details.
- Community reports are moderated, and exact home locations are never publicly exposed.
- Monitor every data feed for staleness. Missing data must never look like "all clear."
