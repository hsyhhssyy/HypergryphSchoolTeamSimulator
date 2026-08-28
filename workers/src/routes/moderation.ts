import { Hono } from 'hono';
import { z } from 'zod';
import type { Question } from '../../../shared/types';
import type { AppBindings } from '../bindings';
import { isAdminRequest } from '../adminAuth';
import { mapRow, QUESTION_COLUMNS, type QuestionRow } from '../questionMapping';

const PENDING_DEFAULT_LIMIT = 20;
const PENDING_MAX_LIMIT = 50;

const reviewBodySchema = z.object({
  id: z.string().min(1),
  status: z.enum(['approved', 'rejected']),
});

type ReviewRow = { status: string; image_a: string; image_b: string | null };

const pendingKeys = (row: ReviewRow): string[] =>
  [row.image_a, row.image_b].filter((key): key is string => key !== null);

const extensionOf = (key: string): string => {
  const match = /\.([a-z0-9]+)$/i.exec(key);
  return match?.[1]?.toLowerCase() ?? 'bin';
};

const deleteObjects = async (bucket: R2Bucket, keys: string[]): Promise<void> => {
  await Promise.all(keys.map((key) => bucket.delete(key).catch(() => undefined)));
};

/**
 * Composite row-value keyset cursor, base64(`${created_at}|${id}`). UUID ids
 * are not ordered with created_at (which is second-granularity and
 * non-unique), so a single-column `id < ?` cursor would both skip and repeat
 * rows; `(created_at, id) < (?, ?)` orders strictly.
 */
const encodeCursor = (createdAt: string, id: string): string => btoa(`${createdAt}|${id}`);

const decodeCursor = (raw: string): { createdAt: string; id: string } | null => {
  let decoded: string;
  try {
    decoded = atob(raw);
  } catch {
    return null;
  }
  const separator = decoded.indexOf('|');
  if (separator <= 0 || separator === decoded.length - 1) return null;
  return { createdAt: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
};

/**
 * Optional moderation path, mounted onto the workshop router. Only exercised
 * when AUTO_APPROVE_WORKSHOP=false (auto-approve leaves nothing pending).
 */
export const moderationRoutes = new Hono<{ Bindings: AppBindings }>();

moderationRoutes.get('/api/workshop/pending', async (c) => {
  if (!isAdminRequest(c)) return c.json({ error: 'forbidden' }, 403);

  const limitRaw = c.req.query('limit') ?? String(PENDING_DEFAULT_LIMIT);
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit <= 0 || limit > PENDING_MAX_LIMIT) {
    return c.json({ error: `limit must be an integer between 1 and ${PENDING_MAX_LIMIT}` }, 400);
  }

  let cursor: { createdAt: string; id: string } | null = null;
  const cursorRaw = c.req.query('cursor');
  if (cursorRaw !== undefined) {
    cursor = decodeCursor(cursorRaw);
    if (cursor === null) {
      return c.json({ error: 'cursor must be a valid base64(created_at|id) token' }, 400);
    }
  }

  const binds: string[] = [];
  let sql = `SELECT ${QUESTION_COLUMNS} FROM questions WHERE status = 'pending'`;
  if (cursor !== null) {
    sql += ' AND (created_at, id) < (?, ?)';
    binds.push(cursor.createdAt, cursor.id);
  }
  sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';

  const result = await c.env.DB.prepare(sql).bind(...binds, limit + 1).all<QuestionRow>();
  const rows = result.results;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const items: Question[] = [];
  for (const row of pageRows) {
    const mapped = mapRow(row);
    if (mapped !== null) items.push(mapped);
  }

  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastRow !== undefined ? encodeCursor(lastRow.created_at, lastRow.id) : null;

  return c.json({ items, nextCursor });
});

moderationRoutes.post('/api/workshop/review', async (c) => {
  if (!isAdminRequest(c)) return c.json({ error: 'forbidden' }, 403);

  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    return c.json({ error: 'body must be valid JSON' }, 400);
  }
  const parsed = reviewBodySchema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: "body must be { id: string, status: 'approved' | 'rejected' }" }, 400);
  }
  const { id, status } = parsed.data;

  const row = await c.env.DB
    .prepare('SELECT status, image_a, image_b FROM questions WHERE id = ?')
    .bind(id)
    .first<ReviewRow>();
  if (row === null) return c.json({ error: 'question not found' }, 404);
  if (row.status !== 'pending') return c.json({ error: 'question has already been reviewed' }, 409);

  const sourceKeys = pendingKeys(row);
  let destinationKeys: string[] = [];

  if (status === 'approved') {
    // A unique publication generation prevents two concurrent reviewers from
    // copying to (and then one loser deleting) the same destination objects.
    const publicationId = crypto.randomUUID();
    destinationKeys = sourceKeys.map(
      (key, index) => `approved/${id}/${publicationId}-${index + 1}.${extensionOf(key)}`
    );
    try {
      for (let index = 0; index < sourceKeys.length; index += 1) {
        const sourceKey = sourceKeys[index]!;
        const destinationKey = destinationKeys[index]!;
        const object = await c.env.IMAGES.get(sourceKey);
        if (object === null) throw new Error(`missing pending image: ${sourceKey}`);
        await c.env.PUBLIC_IMAGES.put(destinationKey, object.body, {
          httpMetadata: {
            contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
            cacheControl: 'public, max-age=31536000, immutable',
          },
        });
      }
    } catch {
      await deleteObjects(c.env.PUBLIC_IMAGES, destinationKeys);
      return c.json({ error: 'failed to publish submission images' }, 500);
    }
  }

  // Guarded UPDATE: re-checks status so a concurrent review cannot double-flip.
  const imageA = status === 'approved' ? destinationKeys[0]! : row.image_a;
  const imageB = status === 'approved' ? (destinationKeys[1] ?? null) : row.image_b;
  const update = await c.env.DB
    .prepare("UPDATE questions SET status = ?, image_a = ?, image_b = ? WHERE id = ? AND status = 'pending'")
    .bind(status, imageA, imageB, id)
    .run();
  if (update.meta.changes === 0) {
    if (status === 'approved') await deleteObjects(c.env.PUBLIC_IMAGES, destinationKeys);
    return c.json({ error: 'question has already been reviewed' }, 409);
  }

  // Once the DB points at public objects (or the submission is rejected), the
  // quarantined copies are no longer needed. Cleanup is best-effort because
  // the authoritative review decision has already committed.
  await deleteObjects(c.env.IMAGES, sourceKeys);

  return c.json({ id, status });
});
