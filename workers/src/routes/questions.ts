import { Hono } from 'hono';
import { z } from 'zod';
import { questionSourceQuerySchema, type Question } from '../../../shared/types';
import type { AppBindings } from '../bindings';
import { mapRow, QUESTION_COLUMNS, type QuestionRow } from '../questionMapping';

const DEFAULT_COUNT = 5;
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
