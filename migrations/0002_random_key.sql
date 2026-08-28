-- 0002_random_key.sql — indexed random question selection.
-- Run once after 0001_init.sql. ALTER TABLE ADD COLUMN is intentionally a
-- one-time migration and will fail loudly if an operator applies it twice.

ALTER TABLE questions ADD COLUMN random_key REAL NOT NULL DEFAULT 0.5;

-- SQLite random() spans signed 64-bit integers. Convert it to [0, 1) without
-- ABS(), whose minimum-integer edge case can overflow.
UPDATE questions
SET random_key = ((random() / 9223372036854775808.0) + 1.0) / 2.0
WHERE random_key IS NULL;

CREATE INDEX idx_questions_random_all
ON questions(status, random_key);

CREATE INDEX idx_questions_random_source
ON questions(status, source, random_key);

CREATE INDEX idx_questions_random_mode
ON questions(status, mode, random_key);

CREATE INDEX idx_questions_random_selection
ON questions(status, mode, source, random_key);
