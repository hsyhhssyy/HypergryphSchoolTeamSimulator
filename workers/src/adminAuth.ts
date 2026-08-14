import type { Context } from 'hono';
import type { AppBindings } from './bindings';

/**
 * Admin-key gate shared by the moderation + image-quarantine routes.
 * Compares the X-Admin-Key REQUEST HEADER against env.ADMIN_KEY — never a URL
 * param or GET body, and neither value is ever logged. Fail-closed: if the env
 * binding is absent, every admin request is denied.
 */
export const isAdminRequest = (c: Context<{ Bindings: AppBindings }>): boolean => {
  const expected = c.env.ADMIN_KEY;
  const provided = c.req.header('X-Admin-Key');
  if (expected === undefined || provided === undefined) return false;
  return provided === expected;
};
