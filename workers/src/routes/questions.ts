import { Hono } from 'hono';
import { z } from 'zod';
import {
  differencesSchema,
  questionSchema,
  questionSourceQuerySchema,
  type Difference,
  type Question,
} from '../../../shared/types';
import type { AppBindings } from '../bindings';

const DEFAULT_COUNT = 5;
const MODE_ALL = 'all';

/** Query-time mode filter: both concrete modes plus the 'all' sentinel. */
const modeQuerySchema = z.enum(['spot_diff', 'find_area', MODE_ALL]);
type ModeQuery = z.infer<typeof modeQuerySchema>;

/**
 * snake_case D1 row. author_id is deliberately NOT selected (privacy) and
 * never crosses the boundary; only public columns are read.
 */
type QuestionRow = {
  id: string;
  mode: string;
  title: string;
  description: string;
  image_a: string;
  image_b: string | null;
  differences: string;
  show_count: number;
  source: string;
  author_name: string | null;
  status: string;
  likes: number;
  dislikes: number;
  created_at: string;
};

/** The DB stores `differences` as a JSON string; null = invalid/corrupt row. */
const parseDifferences = (raw: string): Difference[] | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const result = differencesSchema.safeParse(value);
  return result.success ? result.data : null;
};

/**
 * snake_case DB row → camelCase API Question. Returns null (row skipped,
 * never a 500) when the row is not a valid question — corrupt differences
 * JSON being the named case, any other invariant violation falling out of
 * the same questionSchema gate.
 */
const mapRow = (row: QuestionRow): Question | null => {
  const differences = parseDifferences(row.differences);
  if (differences === null) return null;
  const parsed = questionSchema.safeParse({
    id: row.id,
    mode: row.mode,
    title: row.title,
    description: row.description,
    imageA: row.image_a,
    ...(row.image_b !== null ? { imageB: row.image_b } : {}),
    differences,
    showCount: row.show_count === 1,
    source: row.source,
    ...(row.author_name !== null ? { authorName: row.author_name } : {}),
    status: row.status,
    likes: row.likes,
    dislikes: row.dislikes,
    createdAt: row.created_at,
  });
  return parsed.success ? parsed.data : null;
};

const QUESTION_COLUMNS =
  'id, mode, title, description, image_a, image_b, differences, show_count, source, author_name, status, likes, dislikes, created_at';

export const questionsRoutes = new Hono<{ Bindings: AppBindings }>();

questionsRoutes.get('/api/questions', async (c) => {
  const modeResult = modeQuerySchema.safeParse(c.req.query('mode') ?? MODE_ALL);
  if (!modeResult.success) {
    return c.json({ error: "mode must be one of 'spot_diff', 'find_area', 'all'" }, 400);
  }
  const sourceResult = questionSourceQuerySchema.safeParse(c.req.query('source') ?? 'mixed');
  if (!sourceResult.success) {
    return c.json({ error: "source must be one of 'official', 'workshop', 'mixed'" }, 400);
  }

  const countRaw = c.req.query('count') ?? String(DEFAULT_COUNT);
  const count = Number(countRaw);
  if (!Number.isInteger(count) || count <= 0) {
    return c.json({ error: 'count must be a positive integer' }, 400);
  }

  const mode: ModeQuery = modeResult.data;
  const source = sourceResult.data;

  const conditions: string[] = ["status = 'approved'"];
  const binds: Array<string | number> = [];
  if (mode !== MODE_ALL) {
    conditions.push('mode = ?');
    binds.push(mode);
  }
  if (source === 'mixed') {
    conditions.push("source IN ('official', 'workshop')");
  } else {
    conditions.push('source = ?');
    binds.push(source);
  }

  const statement = c.env.DB.prepare(
    `SELECT ${QUESTION_COLUMNS} FROM questions WHERE ${conditions.join(' AND ')} ORDER BY RANDOM() LIMIT ?`
  );
  const result = await statement.bind(...binds, count).all<QuestionRow>();

  const questions: Question[] = [];
  for (const row of result.results) {
    const mapped = mapRow(row);
    if (mapped !== null) questions.push(mapped);
  }

  return c.json(questions);
});
