import { z } from "zod";

/** Firepoint wire format. Source claims remain claims of their original publishers. */
export const WireVersion = z.literal(1);
const Instant = z.iso.datetime({ offset: true });
const Id = z.string().min(1).max(256);
const Longitude = z.number().finite().min(-180).max(180);
const Latitude = z.number().finite().min(-90).max(90);
export const PointSchema = z.tuple([Longitude, Latitude]); // [longitude, latitude], WGS84

/** Server records distinguish an issuer from the service that redistributed its data. */
export const OriginSchema = z.object({
  operator: z.string().min(1),
  issuer: z.string().min(1).nullable(),
  recordId: Id,
  recordUrl: z.url(),
  retrievedAt: Instant,
  issuedAt: Instant.nullable(),
  updatedAt: Instant.nullable(),
});
export type Origin = z.infer<typeof OriginSchema>;

export const SourceCheckSchema = z.object({
  sourceKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  operator: z.string().min(1),
  endpoint: z.url(),
  applicable: z.boolean(),
  status: z.enum(["ok", "stale", "down", "not-configured", "outside-coverage"]),
  lastAttemptAt: Instant.nullable(),
  lastSuccessAt: Instant.nullable(),
  sourceAsOf: Instant.nullable(),
  staleAfterSeconds: z.number().int().positive(),
  detail: z.string().nullable(),
}).superRefine((check, ctx) => {
  if (check.status === "ok" && (!check.lastAttemptAt || !check.lastSuccessAt)) {
    ctx.addIssue({ code: "custom", path: ["lastSuccessAt"], message: "ok requires a completed fetch" });
  }
  if (check.status === "stale" && !check.lastSuccessAt) {
    ctx.addIssue({ code: "custom", path: ["lastSuccessAt"], message: "stale requires a last-good record" });
  }
  if (["down", "not-configured", "outside-coverage"].includes(check.status) && !check.detail) {
    ctx.addIssue({ code: "custom", path: ["detail"], message: "unavailable sources need an explanation" });
  }
});
export type SourceCheck = z.infer<typeof SourceCheckSchema>;

/** Agency text is not rewritten by Firepoint. Null times remain explicitly unknown. */
export const OfficialNoticeSchema = z.object({
  kind: z.literal("official-notice"),
  category: z.enum(["weather", "evacuation", "shelter", "other"]),
  headline: z.string().min(1),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  startsAt: Instant.nullable(),
  endsAt: Instant.nullable(),
  issuerStatus: z.enum(["active", "ended", "unknown"]),
  match: z.enum(["publisher-point-filter", "official-polygon", "issuer-zone", "regional-context"]),
  areaDescription: z.string().nullable(),
  origin: OriginSchema,
});
export type OfficialNotice = z.infer<typeof OfficialNoticeSchema>;

/** Empty notices means this set of checked sources returned no matches, never an all-clear. */
export const NoticeFeedSchema = z.object({
  version: WireVersion,
  generatedAt: Instant,
  sourceChecks: z.array(SourceCheckSchema),
  notices: z.array(OfficialNoticeSchema),
  allClear: z.literal(false),
}).superRefine((feed, ctx) => {
  if (feed.sourceChecks.length === 0 && feed.notices.length > 0) {
    ctx.addIssue({ code: "custom", path: ["notices"], message: "notices require a named source" });
  }
});
export type NoticeFeed = z.infer<typeof NoticeFeedSchema>;

/**
 * Situational context near a queried point. None of these are orders, forecasts,
 * spread predictions, or evidence that a place is safe; each keeps its publisher's clock.
 */
const Position = z.tuple([Longitude, Latitude]);
const Ring = z.array(Position).min(4);
export const PerimeterGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: z.array(Ring).min(1) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(Ring).min(1)).min(1) }),
]);

export const WildfireIncidentSchema = z.object({
  kind: z.literal("wildfire-incident"),
  name: z.string().min(1),
  incidentType: z.string().nullable(),
  county: z.string().nullable(),
  locationDescription: z.string().nullable(),
  point: PointSchema,
  distanceKm: z.number().finite().nonnegative(),
  acresBurned: z.number().finite().nonnegative().nullable(),
  percentContained: z.number().finite().min(0).max(100).nullable(),
  startedAt: Instant.nullable(),
  caveat: z.string().min(1),
  origin: OriginSchema,
});
export type WildfireIncident = z.infer<typeof WildfireIncidentSchema>;

export const FirePerimeterSchema = z.object({
  kind: z.literal("fire-perimeter"),
  incidentName: z.string().min(1),
  incidentType: z.enum(["wildfire", "prescribed", "complex", "unknown"]),
  gisAcres: z.number().finite().nonnegative().nullable(),
  percentContained: z.number().finite().min(0).max(100).nullable(),
  /** When the publisher says this polygon was mapped; not our fetch time. */
  polygonCapturedAt: Instant.nullable(),
  geometry: PerimeterGeometrySchema,
  caveat: z.string().min(1),
  origin: OriginSchema,
});
export type FirePerimeter = z.infer<typeof FirePerimeterSchema>;

export const AirQualityReadingSchema = z.object({
  kind: z.literal("air-quality-observation"),
  reportingArea: z.string().min(1),
  pollutant: z.string().min(1),
  aqi: z.number().int().nonnegative(),
  category: z.string().nullable(),
  observedAt: Instant.nullable(),
  /** Real-time AirNow observations are preliminary and unvalidated. */
  preliminary: z.literal(true),
  caveat: z.string().min(1),
  origin: OriginSchema,
});
export type AirQualityReading = z.infer<typeof AirQualityReadingSchema>;

/** Empty lists mean those sources returned nothing nearby, never an all-clear. */
export const ContextFeedSchema = z.object({
  version: WireVersion,
  generatedAt: Instant,
  radiusKm: z.number().positive(),
  sourceChecks: z.array(SourceCheckSchema).min(1),
  incidents: z.array(WildfireIncidentSchema),
  perimeters: z.array(FirePerimeterSchema),
  airQuality: z.array(AirQualityReadingSchema),
  allClear: z.literal(false),
});
export type ContextFeed = z.infer<typeof ContextFeedSchema>;

/** A city neighborhood, FEMA flood area or fire-hazard class is never an evacuation zone. */
export const EvacuationZoneSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("unavailable"), reason: z.string().min(1), officialLookupUrl: z.url().nullable() }),
  z.object({
    result: z.literal("verified"), zoneId: z.string().min(1), boundaryRevision: z.string().min(1),
    point: PointSchema, verifiedAt: Instant, origin: OriginSchema,
  }),
]);
export type EvacuationZone = z.infer<typeof EvacuationZoneSchema>;

/** Standing mapped designation, NOT today's event, forecast, or property safety rating. */
export const StandingHazardSchema = z.object({
  kind: z.literal("standing-hazard"),
  hazard: z.enum(["wildfire", "flood", "fault-rupture", "liquefaction", "landslide", "dam-inundation", "debris-flow"]),
  dataset: z.string().min(1),
  classification: z.string().nullable(),
  lookup: z.enum(["inside", "outside", "unavailable"]),
  coverage: z.enum(["verified", "unknown", "out-of-bounds"]),
  caveat: z.string().min(1),
  origin: OriginSchema,
}).superRefine((item, ctx) => {
  if (item.lookup !== "unavailable" && item.coverage !== "verified") {
    ctx.addIssue({ code: "custom", path: ["coverage"], message: "positive or negative lookup requires verified coverage" });
  }
});
export type StandingHazard = z.infer<typeof StandingHazardSchema>;

/** Mapped hazard designations at a point from a dated snapshot. Never current conditions. */
export const StandingHazardFeedSchema = z.object({
  version: WireVersion,
  generatedAt: Instant,
  sourceChecks: z.array(SourceCheckSchema).length(1),
  hazards: z.array(StandingHazardSchema),
  allClear: z.literal(false),
});
export type StandingHazardFeed = z.infer<typeof StandingHazardFeedSchema>;

/** Publication means moderation, not official confirmation. No private reporter data here. */
export const PublishedObservationSchema = z.object({
  kind: z.literal("community-observation"),
  id: Id,
  topic: z.enum(["smoke", "flooding", "road-obstruction", "utility", "other"]),
  redactedText: z.string().min(1).max(1200),
  observedAt: Instant.nullable(),
  publishedAt: Instant,
  approximatePoint: PointSchema.nullable(),
  precisionMeters: z.number().positive().nullable(),
  verification: z.literal("unverified"),
}).superRefine((item, ctx) => {
  if ((item.approximatePoint === null) !== (item.precisionMeters === null)) {
    ctx.addIssue({ code: "custom", path: ["precisionMeters"], message: "precision must accompany any public point" });
  }
});
export type PublishedObservation = z.infer<typeof PublishedObservationSchema>;

/** Receipt is not publication, confirmation, or emergency dispatch. */
export const SubmissionReceiptSchema = z.object({
  receiptId: Id,
  receivedAt: Instant,
  disposition: z.literal("awaiting-moderation"),
  emergencyDispatch: z.literal(false),
});
export type SubmissionReceipt = z.infer<typeof SubmissionReceiptSchema>;

/** Precise locations must travel in POST bodies, not request URLs. */
export const PlaceQuerySchema = z.object({ point: PointSchema, userInitiated: z.literal(true) });
export type PlaceQuery = z.infer<typeof PlaceQuerySchema>;
