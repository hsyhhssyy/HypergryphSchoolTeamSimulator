import { Hono } from 'hono';
import type { AppBindings } from '../bindings';
import { isAdminRequest } from '../adminAuth';

export const imagesRoutes = new Hono<{ Bindings: AppBindings }>();

const PUBLIC_CACHE_CONTROL = 'public, max-age=86400';

/**
 * Serve-time quarantine: the image's question row — looked up by flat R2 key
 * (`WHERE image_a = filename OR image_b = filename`, never by parsing the id
 * out of the filename) — decides who may see the bytes. Approved: public with
 * long cache + nosniff. Pending: admin-only preview, never cached. Rejected:
 * never served. This is the CORE path; moderation endpoints are the optional
 * half of the same gate.
 */
imagesRoutes.get('/images/:filename', async (c) => {
  const filename = c.req.param('filename');

  const row = await c.env.DB
    .prepare('SELECT status FROM questions WHERE image_a = ? OR image_b = ? LIMIT 1')
    .bind(filename, filename)
    .first<{ status: string }>();
  if (row === null) return c.json({ error: 'not found' }, 404);

  if (row.status === 'rejected') return c.json({ error: 'not found' }, 403);
  if (row.status === 'pending' && !isAdminRequest(c)) return c.json({ error: 'forbidden' }, 403);

  const object = await c.env.IMAGES.get(filename);
  if (object === null) return c.json({ error: 'not found' }, 404);

  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
  });
  if (row.status === 'approved') {
    headers.set('Cache-Control', PUBLIC_CACHE_CONTROL);
    headers.set('X-Content-Type-Options', 'nosniff');
  }
  return new Response(object.body, { headers });
});
