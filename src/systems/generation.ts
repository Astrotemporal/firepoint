import { z } from "zod";

/** Pure planning contract only. No worker, database, polling, or resident UI imports this file. */
const Instant = z.iso.datetime({ offset: true });
const SourceKey = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const SourceDescriptorSchema = z.object({
  sourceKey: SourceKey,
  operator: z.string().min(1),
  issuer: z.string().min(1).nullable(), // aggregator/operator is not automatically the issuing agency
  sourceUrl: z.url().refine((url) => new URL(url).protocol === "https:", "publisher URL must be HTTPS"),
  lane: z.enum(["official-notice", "incident-context", "standing-hazard", "planning-model"]),
  coverageDescription: z.string().min(1).nullable(),
  updateCadenceSeconds: z.number().int().positive().nullable(), // unknown stays null
});
export type SourceDescriptor = z.infer<typeof SourceDescriptorSchema>;

const CandidateSchema = z.object({
  sourceKey: SourceKey,
  generationId: z.string().min(1),
  fetchedAt: Instant,
  sourceAsOf: Instant.nullable(),
  recordCount: z.number().int().nonnegative(), // zero records is not an all-clear
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.string().min(1),
  complete: z.boolean(), // all pages and source checks passed, not an empty rebuild gap
  coverageVerified: z.boolean(),
  rightsReviewed: z.boolean(),
});
export const PublishedGenerationSchema = CandidateSchema.extend({
  complete: z.literal(true),
  coverageVerified: z.literal(true),
  rightsReviewed: z.literal(true),
});
export type PublishedGeneration = z.infer<typeof PublishedGenerationSchema>;

export const IngestAttemptSchema = z.object({
  sourceKey: SourceKey,
  attemptedAt: Instant,
  outcome: z.enum(["complete", "partial", "failed"]),
  candidate: CandidateSchema.nullable(),
  failureReason: z.string().min(1).nullable(),
}).superRefine((attempt, ctx) => {
  if (attempt.outcome === "complete" && !attempt.candidate) {
    ctx.addIssue({ code: "custom", path: ["candidate"], message: "complete attempt needs evidence" });
  }
  if (attempt.outcome !== "complete" && !attempt.failureReason) {
    ctx.addIssue({ code: "custom", path: ["failureReason"], message: "failed/partial attempt needs a reason" });
  }
  if (attempt.candidate?.sourceKey !== undefined && attempt.candidate.sourceKey !== attempt.sourceKey) {
    ctx.addIssue({ code: "custom", path: ["candidate", "sourceKey"], message: "wrong source" });
  }
});
export type IngestAttempt = z.infer<typeof IngestAttemptSchema>;

export const GenerationStateSchema = z.object({
  sourceKey: SourceKey,
  lastAttemptAt: Instant.nullable(),
  lastGood: PublishedGenerationSchema.nullable(),
}).superRefine((state, ctx) => {
  if (state.lastGood && state.lastGood.sourceKey !== state.sourceKey) {
    ctx.addIssue({ code: "custom", path: ["lastGood", "sourceKey"], message: "wrong source" });
  }
});
export type GenerationState = z.infer<typeof GenerationStateSchema>;

export const PromotionPlanSchema = z.object({
  action: z.enum(["publish", "retain-last-good"]),
  reason: z.enum(["complete-and-reviewed", "failed-or-partial", "incomplete", "coverage-unverified",
    "rights-unreviewed", "older-attempt", "older-generation"]),
  next: GenerationStateSchema,
});
export type PromotionPlan = z.infer<typeof PromotionPlanSchema>;

/**
 * Decide what a future worker MAY publish. A durable worker must validate upstream
 * completeness and commit attempt + generation atomically. This does neither.
 * A failure retains last-good evidence but NEVER labels it current or safe.
 */
export function planGenerationPromotion(state: unknown, input: unknown): PromotionPlan {
  const previous = GenerationStateSchema.parse(state);
  const attempt = IngestAttemptSchema.parse(input);
  if (previous.sourceKey !== attempt.sourceKey) throw new Error("Attempt source does not match registry state");
  const retain = (reason: PromotionPlan["reason"], lastAttemptAt = attempt.attemptedAt) =>
    PromotionPlanSchema.parse({ action: "retain-last-good", reason,
      next: { ...previous, lastAttemptAt } });

  if (previous.lastAttemptAt && Date.parse(attempt.attemptedAt) <= Date.parse(previous.lastAttemptAt)) {
    return retain("older-attempt", previous.lastAttemptAt);
  }
  if (attempt.outcome !== "complete" || !attempt.candidate) return retain("failed-or-partial");
  const candidate = attempt.candidate;
  if (!candidate.complete) return retain("incomplete");
  if (!candidate.coverageVerified) return retain("coverage-unverified");
  if (!candidate.rightsReviewed) return retain("rights-unreviewed");
  if (previous.lastGood && Date.parse(candidate.fetchedAt) <= Date.parse(previous.lastGood.fetchedAt)) {
    return retain("older-generation");
  }
  return PromotionPlanSchema.parse({ action: "publish", reason: "complete-and-reviewed",
    next: { sourceKey: previous.sourceKey, lastAttemptAt: attempt.attemptedAt,
      lastGood: PublishedGenerationSchema.parse(candidate) } });
}
