/**
 * User-facing error mapping (todo 24 contract).
 *
 * The app NEVER shows raw error text (English fetch messages like "Failed to
 * fetch", server internals, or stack traces). Every catch block routes the
 * thrown value through `friendlyErrorMessage`, which maps by ERROR TYPE, not
 * by message content:
 *
 * - `TypeError` — a failed `fetch` (network down / CORS / DNS) → the offline
 *   message. This is the only signal a browser gives for a network failure;
 *   its message is "Failed to fetch" (or an English variant), never shown.
 * - `ApiError` with HTTP 429 — rate limited → retry-after message.
 * - `ApiError` with HTTP >= 500 — server-side failure → service message.
 * - everything else → the caller's domain fallback ("加载失败，请重试" etc.),
 *   which is where the retry affordance lives (the button IS the retry).
 */
import { ApiError } from '@/lib/api';

/** Network-failure message — fetch threw before any HTTP response arrived. */
export const NETWORK_ERROR_MESSAGE = '网络连接异常，请检查网络后重试';
/** HTTP 429 — the server rate-limits submissions (todo 16). */
export const RATE_LIMIT_MESSAGE = '操作过于频繁，请稍后再试';
/** HTTP >= 500 — server-side failure, never the raw body. */
export const SERVER_ERROR_MESSAGE = '服务暂时不可用，请稍后重试';

/**
 * Map an unknown thrown value to a friendly Chinese message. Never includes
 * `err.message` or `err.stack` — raw text is for `console.error` only.
 */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError) return NETWORK_ERROR_MESSAGE;
  if (err instanceof ApiError) {
    if (err.status === 429) return RATE_LIMIT_MESSAGE;
    if (err.status >= 500) return SERVER_ERROR_MESSAGE;
  }
  return fallback;
}
