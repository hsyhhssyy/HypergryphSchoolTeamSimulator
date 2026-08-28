import { Hono } from 'hono';
import { apiSubmitBodySchema, type QuestionStatus } from '../../../shared/types';
import type { AppBindings } from '../bindings';
import { moderationRoutes } from './moderation';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_MAX_PER_HOUR = 5;
const RATE_LIMIT_RETRY_AFTER_SECONDS = 3600;

/** Raster-only whitelist: rejects image/svg+xml (stored-XSS defense). */
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

const isAllowedImageType = (type: string): type is AllowedImageType => type in ALLOWED_IMAGE_TYPES;

const pad2 = (n: number): string => String(n).padStart(2, '0');

const utcHourKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}-${pad2(date.getUTCHours())}`;

const formText = async (form: FormData, name: string): Promise<string | undefined> => {
  const entry = form.get(name);
  if (entry === null) return undefined;
  return typeof entry === 'string' ? entry : entry.text();
};

const formFile = (form: FormData, name: string): File | null => {
  const entry = form.get(name);
  return entry instanceof File ? entry : null;
};

type ImageCheckResult = { ok: true; contentType: AllowedImageType } | { ok: false; status: 400 | 413; error: string };

const checkImage = (file: File, name: string): ImageCheckResult => {
  if (file.size >= MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: `${name} exceeds the 5MB limit` };
  }
  if (!isAllowedImageType(file.type)) {
    return { ok: false, status: 400, error: `${name} has unsupported type '${file.type}'` };
  }
  return { ok: true, contentType: file.type };
};

/** Upserts the hourly counter; returns the offending key when the limit is exceeded. */
const checkRateLimit = async (db: D1Database, ip: string, userId: string | undefined): Promise<string | null> => {
  const now = new Date();
  const hour = utcHourKey(now);
  const keys = [`ip:${ip}:${hour}`];
  if (userId !== undefined) keys.push(`uid:${userId}:${hour}`);
  for (const key of keys) {
    await db
      .prepare(
        'INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1'
      )
      .bind(key, now.toISOString())
      .run();
    const row = await db.prepare('SELECT count FROM rate_limits WHERE key = ?').bind(key).first<{ count: number }>();
    if ((row?.count ?? 0) > RATE_LIMIT_MAX_PER_HOUR) return key;
  }
  return null;
};

const deleteObjects = async (bucket: R2Bucket, keys: string[]): Promise<void> => {
  for (const key of keys) {
    try {
      await bucket.delete(key);
    } catch {
      void key; // best-effort cleanup — the request is already failing
    }
  }
};

export const workshopRoutes = new Hono<{ Bindings: AppBindings }>();

workshopRoutes.post('/api/workshop', async (c) => {
  const { DB, IMAGES, PUBLIC_IMAGES } = c.env;

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'invalid multipart form data' }, 400);
  }

  const parsed = apiSubmitBodySchema.safeParse({
    mode: await formText(form, 'mode'),
    title: await formText(form, 'title'),
    description: await formText(form, 'description'),
    differences: await formText(form, 'differences'),
    show_count: await formText(form, 'show_count'),
    author_name: await formText(form, 'author_name'),
    author_id: await formText(form, 'author_id'),
  });
  if (!parsed.success) {
    return c.json(
      { error: 'validation failed', details: parsed.error.issues.map((issue) => issue.message) },
      400
    );
  }
  const body = parsed.data;

  const fileA = formFile(form, 'image_a');
  if (fileA === null) return c.json({ error: 'image_a is required' }, 400);
  const checkA = checkImage(fileA, 'image_a');
  if (!checkA.ok) return c.json({ error: checkA.error }, checkA.status);

  const fileB = formFile(form, 'image_b');
  let imageBExt: AllowedImageType | null = null;
  if (body.mode === 'spot_diff') {
    if (fileB === null) return c.json({ error: 'image_b is required for spot_diff' }, 400);
    const checkB = checkImage(fileB, 'image_b');
    if (!checkB.ok) return c.json({ error: checkB.error }, checkB.status);
    imageBExt = checkB.contentType;
  } else if (fileB !== null) {
    return c.json({ error: 'find_area submissions must not include image_b' }, 400);
  }

  const ip = c.req.header('CF-Connecting-IP') ?? '127.0.0.1';
  const limitedKey = await checkRateLimit(DB, ip, body.author_id);
  if (limitedKey !== null) {
    c.header('Retry-After', String(RATE_LIMIT_RETRY_AFTER_SECONDS));
    return c.json({ error: 'submission rate limit exceeded (max 5 per hour)' }, 429);
  }

  const id = crypto.randomUUID();
  const status: QuestionStatus = c.env.AUTO_APPROVE_WORKSHOP !== 'false' ? 'approved' : 'pending';
  const prefix = status === 'approved' ? 'approved' : 'pending';
  const imageAKey = `${prefix}/${id}-1.${ALLOWED_IMAGE_TYPES[checkA.contentType]}`;
  const targetBucket = status === 'approved' ? PUBLIC_IMAGES : IMAGES;

  const uploaded: string[] = [];
  const putImage = async (file: File, key: string): Promise<void> => {
    uploaded.push(key);
    await targetBucket.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        ...(status === 'approved' ? { cacheControl: 'public, max-age=31536000, immutable' } : {}),
      },
    });
  };

  let imageBKey: string | null = null;
  try {
    await putImage(fileA, imageAKey);
    if (imageBExt !== null && fileB !== null) {
      imageBKey = `${prefix}/${id}-2.${ALLOWED_IMAGE_TYPES[imageBExt]}`;
      await putImage(fileB, imageBKey);
    }
  } catch {
    await deleteObjects(targetBucket, uploaded);
    return c.json({ error: 'image upload failed' }, 500);
  }

  const createdAt = new Date().toISOString();
  const randomKey = crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000;
  try {
    await DB.prepare(
      `INSERT INTO questions
         (id, mode, title, description, image_a, image_b, differences, show_count, source, author_id, author_name, status, likes, dislikes, random_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workshop', ?, ?, ?, 0, 0, ?, ?)`
    )
      .bind(
        id,
        body.mode,
        body.title,
        body.description,
        imageAKey,
        imageBKey,
        JSON.stringify(body.differences),
        body.show_count ? 1 : 0,
        body.author_id ?? null,
        body.author_name,
        status,
        randomKey,
        createdAt
      )
      .run();
  } catch {
    await deleteObjects(targetBucket, uploaded);
    return c.json({ error: 'failed to store submission' }, 500);
  }

  return c.json(
    {
      id,
      mode: body.mode,
      title: body.title,
      description: body.description,
      imageA: imageAKey,
      imageB: imageBKey,
      showCount: body.show_count,
      source: 'workshop',
      authorName: body.author_name,
      status,
      likes: 0,
      dislikes: 0,
      createdAt,
      ...(body.author_id !== undefined ? { authorId: body.author_id } : {}),
    },
    201
  );
});
workshopRoutes.route('/', moderationRoutes);
