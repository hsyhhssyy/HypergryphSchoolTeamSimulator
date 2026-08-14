/**
 * Shared game-domain types and Zod schemas.
 *
 * Runtime rules:
 * - Zod schemas are SERVER-ONLY. The frontend must import only the inferred
 *   types via `import type { Question } from '@shared/types'` (zero runtime
 *   cost; `verbatimModuleSyntax` erases type-only imports).
 * - API JSON payloads use camelCase field names. DB columns are snake_case;
 *   the mapping happens explicitly in the backend route handlers.
 * - Multipart request bodies (workshop submission) use snake_case field
 *   names because FormData is not JSON — see ApiSubmitBody.
 */
import { z } from 'zod';

// --- Enums -------------------------------------------------------------

/** Canonical game-phase set. SINGLE source of truth — no other phase set exists. */
export const gamePhaseSchema = z.enum(['menu', 'playing', 'round_end', 'result']);
export type GamePhase = z.infer<typeof gamePhaseSchema>;

export const questionModeSchema = z.enum(['spot_diff', 'find_area']);
export type QuestionMode = z.infer<typeof questionModeSchema>;

/** Stored per-question source (what the DB row records). */
export const questionSourceSchema = z.enum(['official', 'workshop']);
export type QuestionSource = z.infer<typeof questionSourceSchema>;

export const questionStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type QuestionStatus = z.infer<typeof questionStatusSchema>;

/** Query-time source filter. Distinct from the stored per-question QuestionSource. */
export const questionSourceQuerySchema = z.enum(['official', 'workshop', 'mixed']);
export type QuestionSourceQuery = z.infer<typeof questionSourceQuerySchema>;

// --- Difference (image-NATIVE pixel coordinates) ------------------------

/** Plan-imposed ceiling: rejects absurd coordinates (image-native px), beyond finite/positive checks. */
const MAX_DIFFERENCE_VALUE = 100000;

export const circleDifferenceSchema = z.object({
  type: z.literal('circle'),
  x: z.number().finite().nonnegative().max(MAX_DIFFERENCE_VALUE),
  y: z.number().finite().nonnegative().max(MAX_DIFFERENCE_VALUE),
  radius: z.number().finite().positive().max(MAX_DIFFERENCE_VALUE),
});

export const rectDifferenceSchema = z.object({
  type: z.literal('rect'),
  x: z.number().finite().nonnegative().max(MAX_DIFFERENCE_VALUE),
  y: z.number().finite().nonnegative().max(MAX_DIFFERENCE_VALUE),
  width: z.number().finite().positive().max(MAX_DIFFERENCE_VALUE),
  height: z.number().finite().positive().max(MAX_DIFFERENCE_VALUE),
});

export const differenceSchema = z.discriminatedUnion('type', [
  circleDifferenceSchema,
  rectDifferenceSchema,
]);
export type Difference = z.infer<typeof differenceSchema>;

export const differencesSchema = z.array(differenceSchema).min(1);

// --- Question (camelCase API JSON) -------------------------------------

export const questionSchema = z.object({
  id: z.string().min(1),
  mode: questionModeSchema,
  title: z.string().min(1),
  /** 题目描述 instruction text — REQUIRED, shown above the images during play. */
  description: z.string().min(1),
  imageA: z.string().min(1),
  imageB: z.string().min(1).optional(),
  differences: differencesSchema,
  showCount: z.boolean(),
  source: questionSourceSchema,
  authorId: z.string().min(1).optional(),
  authorName: z.string().min(1).optional(),
  status: questionStatusSchema,
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
});
export type Question = z.infer<typeof questionSchema>;

// --- Game state --------------------------------------------------------

export const gameStateSchema = z.object({
  phase: gamePhaseSchema,
  mode: questionModeSchema,
  source: questionSourceQuerySchema,
  questions: z.array(questionSchema),
  questionIndex: z.number().int().nonnegative(),
  /** null while no round is loaded (menu phase). */
  currentQuestion: questionSchema.nullable(),
  foundIndices: z.array(z.number().int().nonnegative()),
  score: z.number().int(),
  wrongCount: z.number().int().nonnegative(),
  timeLeft: z.number().int(),
});
export type GameState = z.infer<typeof gameStateSchema>;

// --- API request bodies -------------------------------------------------

/** Multipart FormData carries `differences` as a JSON-encoded Difference[]. */
const differencesJsonSchema = z
  .string()
  .min(1)
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'differences must be a valid JSON array',
      });
      return z.NEVER;
    }
  })
  .pipe(differencesSchema);

/** Workshop submission body. snake_case field names (multipart FormData). */
export const apiSubmitBodySchema = z.object({
  mode: questionModeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(200),
  differences: differencesJsonSchema,
  show_count: z.enum(['true', 'false']).transform((value) => value === 'true'),
  author_name: z.string().trim().min(2).max(20),
  author_id: z.string().trim().min(1).optional(),
});
export type ApiSubmitBody = z.infer<typeof apiSubmitBodySchema>;

/** Rating request body. snake_case by contract (POST /api/ratings). */
export const apiRatingBodySchema = z.object({
  question_id: z.string().min(1),
  user_id: z.string().min(1),
  vote: z.enum(['like', 'dislike']),
});
export type ApiRatingBody = z.infer<typeof apiRatingBodySchema>;
