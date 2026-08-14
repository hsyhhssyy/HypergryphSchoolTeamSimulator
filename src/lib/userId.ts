/**
 * Anonymous player identity (extracted from App.tsx at todo 20 so both the
 * game flow and the workshop submission form reuse ONE storage key).
 *
 * Created once via crypto.randomUUID() and persisted in localStorage; the
 * workshop form sends it as `author_id` (same person, same identity — todo
 * 16 rate-limits on it server-side).
 */
const USER_ID_KEY = 'h5-spot-diff.userId';

export function getOrCreateUserId(): string {
  if (typeof localStorage === 'undefined') return '';
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}
