import { differencesSchema, questionSchema, type Difference, type Question } from '../../shared/types';

/** snake_case D1 row. author_id is deliberately NOT selected (privacy). */
export type QuestionRow = {
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

export const QUESTION_COLUMNS =
  'id, mode, title, description, image_a, image_b, differences, show_count, source, author_name, status, likes, dislikes, created_at';

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
export const mapRow = (row: QuestionRow): Question | null => {
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
