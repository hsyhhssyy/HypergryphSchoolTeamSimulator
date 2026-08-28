import { Hono } from 'hono';
import type { AppBindings } from '../bindings';
import { isAdminRequest } from '../adminAuth';

export const imagesRoutes = new Hono<{ Bindings: AppBindings }>();

const PUBLIC_CACHE_CONTROL = 'public, max-age=86400';
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const objectKeyFromPath = (url: string, routePrefix: string): string | null => {
  const pathname = new URL(url).pathname;
  if (!pathname.startsWith(routePrefix)) return null;
  try {
    const key = decodeURIComponent(pathname.slice(routePrefix.length));
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
};

/**
 * Approved-image fallback when no R2 custom domain is configured. This route
 * performs one public-bucket read and never touches D1; immutable keys make it
 * safe for browsers and the Cloudflare edge to cache for a year.
 */
imagesRoutes.get('/public-images/*', async (c) => {
  const key = objectKeyFromPath(c.req.url, '/public-images/');
  if (key === null || !key.startsWith('approved/')) return c.json({ error: 'not found' }, 404);

  const object = await c.env.PUBLIC_IMAGES.get(key);
  if (object === null) return c.json({ error: 'not found' }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': IMMUTABLE_CACHE_CONTROL,
      ETag: object.httpEtag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

/**
 * Private quarantine and legacy compatibility route. A D1 lookup decides who
 * may see the bytes: pending is admin-only, rejected is denied, and historical
 * flat-key approved objects remain readable until they are migrated. New
 * approved objects never use this route.
 */
imagesRoutes.get('/images/*', async (c) => {
  const filename = objectKeyFromPath(c.req.url, '/images/');
  if (filename === null) return c.json({ error: 'not found' }, 404);

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
