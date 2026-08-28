import { Hono } from 'hono';
import { z } from 'zod';
import { questionSourceQuerySchema, type Question } from '../../../shared/types';
import type { AppBindings } from '../bindings';
import { mapRow, QUESTION_COLUMNS, type QuestionRow } from '../questionMapping';

const DEFAULT_COUNT = 5;
const MAX_COUNT = 100;
const MODE_ALL = 'all';

/** Query-time mode filter: both concrete modes plus the 'all' sentinel. */
const modeQuerySchema = z.enum(['spot_diff', 'find_area', MODE_ALL]);
type ModeQuery = z.infer<typeof modeQuerySchema>;

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
  if (!Number.isInteger(count) || count <= 0 || count > MAX_COUNT) {
    return c.json({ error: `count must be an integer between 1 and ${MAX_COUNT}` }, 400);
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

  // Indexed random seek: start at a uniformly random point, read forward,
  // then wrap once. Unlike ORDER BY RANDOM(), this does not sort every
  // matching row on every game launch.
  const pivot = crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000;
  const where = conditions.join(' AND ');
  const first = await c.env.DB.prepare(
    `SELECT ${QUESTION_COLUMNS} FROM questions
     WHERE ${where} AND random_key >= ? ORDER BY random_key LIMIT ?`
  ).bind(...binds, pivot, count).all<QuestionRow>();

  let rows = first.results;
  const remaining = count - rows.length;
  if (remaining > 0) {
    const wrapped = await c.env.DB.prepare(
      `SELECT ${QUESTION_COLUMNS} FROM questions
       WHERE ${where} AND random_key < ? ORDER BY random_key LIMIT ?`
    ).bind(...binds, pivot, remaining).all<QuestionRow>();
    rows = [...rows, ...wrapped.results];
  }

  const questions: Question[] = [];
  for (const row of rows) {
    const mapped = mapRow(row);
    if (mapped !== null) questions.push(mapped);
  }

  return c.json(questions);
});
