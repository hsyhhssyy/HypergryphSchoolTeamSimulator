/**
 * Typed API client for the CF Workers backend.
 *
 * Conventions:
 * - API JSON is camelCase; the shared types are imported TYPE-ONLY so no
 *   Zod runtime lands in the client bundle (todo 2 contract).
 * - Non-2xx responses throw `Error` carrying the human-readable message from
 *   the JSON body (`message`/`error` field) — never the raw JSON.
 * - The admin key travels exclusively in the `X-Admin-Key` HEADER. It must
 *   never appear in a URL (query params leak into logs).
 */
import type {
  ApiRatingBody,
  Question,
  QuestionMode,
  QuestionSourceQuery,
} from '@shared/types';

/** Worker API base. `VITE_API_URL` wins when set; local dev default otherwise. */
const API_BASE: string = import.meta.env.VITE_API_URL || 'http://localhost:8787';

/** Review decisions the admin can apply to a workshop submission. */
export type ReviewDecision = 'approved' | 'rejected';

/** One page of pending workshop submissions (cursor pagination, todo 19). */
export interface PendingSubmissionsPage {
  items: Question[];
  nextCursor: string | null;
}

/** Extract a human-readable message from a non-2xx response body. */
async function readErrorMessage(res: Response): Promise<string> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return `HTTP ${res.status}`;
  }
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.error;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return `HTTP ${res.status}`;
}

/** fetch + ok-check + JSON decode. Non-2xx → Error(message from JSON). */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as T;
}

/**
 * Fetch a random question set. `mode` filters spot_diff/find_area,
 * `source` is the query-time filter (official|workshop|mixed), `count` the
 * requested size (server may return fewer).
 */
export async function fetchQuestions(
  mode: QuestionMode,
  source: QuestionSourceQuery,
  count: number,
): Promise<Question[]> {
  const params = new URLSearchParams({ mode, source, count: String(count) });
  return requestJson<Question[]>(`/api/questions?${params.toString()}`);
}

/**
 * Submit a workshop question as multipart FormData (snake_case fields per
 * todo 16). Returns the created question id.
 */
export async function submitWorkshopQuestion(
  body: FormData,
): Promise<{ id: string }> {
  return requestJson<{ id: string }>('/api/workshop', { method: 'POST', body });
}

/** Like/dislike a workshop question. One vote per user per question (upsert). */
export async function rateQuestion(
  questionId: string,
  userId: string,
  vote: ApiRatingBody['vote'],
): Promise<void> {
  const payload: ApiRatingBody = {
    question_id: questionId,
    user_id: userId,
    vote,
  };
  await requestJson<unknown>('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** List pending submissions for the admin review page. Admin-key auth via header. */
export async function fetchPendingSubmissions(
  adminKey: string,
): Promise<PendingSubmissionsPage> {
  return requestJson<PendingSubmissionsPage>('/api/workshop/pending', {
    headers: { 'X-Admin-Key': adminKey },
  });
}

/** Approve/reject a pending submission (optional moderation mode). */
export async function reviewSubmission(
  id: string,
  status: ReviewDecision,
  adminKey: string,
): Promise<void> {
  await requestJson<unknown>('/api/workshop/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: JSON.stringify({ id, status }),
  });
}

/**
 * Resolve a question image reference to a fetchable URL. Values starting
 * with `http` are full external URLs (official placeholders) used AS-IS;
 * anything else is an R2 key served through the Worker image route.
 */
export function resolveImageUrl(value: string): string {
  return value.startsWith('http') ? value : `${API_BASE}/images/${value}`;
}

/**
 * Fetch a workshop image as a Blob for the admin review thumbnail
 * (object-URL path). Pending images are quarantined at serve time — only
 * requests carrying a valid admin key succeed.
 */
export async function fetchAdminImage(
  filename: string,
  adminKey: string,
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/images/${filename}`, {
    headers: { 'X-Admin-Key': adminKey },
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return res.blob();
}
