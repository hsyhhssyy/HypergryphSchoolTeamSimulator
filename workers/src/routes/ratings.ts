import { Hono } from 'hono';
import { z } from 'zod';
import { apiRatingBodySchema } from '../../../shared/types';
import type { AppBindings } from '../bindings';

/** Row shape read back from `questions` after the count update. */
const ratingCountsSchema = z.object({
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
});

type QuestionGateRow = { source: string; status: string };

/**
 * POST /api/ratings — like/dislike upsert + aggregated counts.
 *
 * Known limitation (anonymous v1): `user_id` is self-asserted with no auth —
 * vote integrity is a soft boundary, not a security guarantee. The UNIQUE
 * (question_id, user_id) constraint still guarantees at most one vote per
 * (question, user) pair, so counts are never inflated by duplicate rows.
 */
export const ratingsRoutes = new Hono<{ Bindings: AppBindings }>();

ratingsRoutes.post('/api/ratings', async (c) => {
  // Parse the JSON boundary explicitly: a malformed body is a client error
  // (400), not a 500 from an uncaught SyntaxError out of c.req.json().
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'body must be valid JSON' }, 400);
  }
  const parsed = apiRatingBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      { error: "body must be { question_id, user_id, vote: 'like' | 'dislike' }" },
      400
    );
  }
  const { question_id: questionId, user_id: userId, vote } = parsed.data;

  // Rateability gate: only approved workshop questions are rateable.
  const question = await c.env.DB.prepare('SELECT source, status FROM questions WHERE id = ?')
    .bind(questionId)
    .first<QuestionGateRow>();
  if (question === null) {
    return c.json({ error: 'question not found' }, 404);
  }
  if (question.source === 'official') {
    return c.json({ error: 'official questions are not rateable' }, 403);
  }
  if (question.status !== 'approved') {
    return c.json({ error: 'question is not approved' }, 403);
  }

  // Upsert + recount + update in ONE atomic batch:
  //   1. INSERT ... ON CONFLICT(question_id, user_id) DO UPDATE (keyed on the
  //      UNIQUE constraint — NOT INSERT OR REPLACE, which would delete/reinsert
  //      and is ambiguous with the `id` PK).
  //   2. UPDATE questions with fresh aggregated counts via scalar subqueries.
  //      (The plan's literal "SELECT COUNT(*) then UPDATE ... SET likes=?"
  //      form cannot share one batch: D1 binds are fixed when each statement
  //      is prepared, so the UPDATE cannot consume COUNTs returned mid-batch.
  //      Subqueries keep the recount + update inside the batch and make the
  //      whole mutation atomic — the stored counts always reflect the ratings
  //      table at UPDATE time and can never drift negative.)
  //   3. Read back the stored likes/dislikes for the response.
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO ratings (id, question_id, user_id, vote) VALUES (?, ?, ?, ?)
       ON CONFLICT(question_id, user_id) DO UPDATE SET vote = excluded.vote`
    ).bind(crypto.randomUUID(), questionId, userId, vote),
    c.env.DB.prepare(
      `UPDATE questions SET
         likes = (SELECT COUNT(*) FROM ratings WHERE question_id = ? AND vote = 'like'),
         dislikes = (SELECT COUNT(*) FROM ratings WHERE question_id = ? AND vote = 'dislike')
       WHERE id = ?`
    ).bind(questionId, questionId, questionId),
    c.env.DB.prepare('SELECT likes, dislikes FROM questions WHERE id = ?').bind(questionId),
  ]);

  const counts = ratingCountsSchema.safeParse(results[2]?.results[0]);
  if (!counts.success) {
    return c.json({ error: 'failed to read updated counts' }, 500);
  }
  return c.json({ likes: counts.data.likes, dislikes: counts.data.dislikes });
});
