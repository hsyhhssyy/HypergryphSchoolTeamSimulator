-- official-questions.sql — seed 5 official sample questions (todo 5)
--
-- Idempotent: fixed string ids + INSERT OR IGNORE. Re-running this file is a
-- existing question rows are never duplicated; the five fixed random keys at
-- the end are safely normalized on every run (2nd run keeps COUNT at 5).
--
-- Images are DETERMINISTIC placeholders from picsum.photos (see
-- seed/images/README.md). image_a and image_b use DIFFERENT seeds per
-- question so the two panels are visually distinct but always resolve to the
-- same photos. No real/copyrighted assets, no base64.
--
-- differences: JSON array of discriminated Difference objects in image-NATIVE
-- pixels (canvas is 800x600). Every shape sits fully inside the canvas.
--   circle -> {"type":"circle","x":..,"y":..,"radius":..}   (radius > 0)
--   rect   -> {"type":"rect","x":..,"y":..,"width":..,"height":..} (width>0, height>0)
-- Matches differenceSchema in shared/types.ts (finite non-negative coords).

-- 1) spot_diff — 3 differences, count visible
INSERT OR IGNORE INTO questions
  (id, mode, title, description, image_a, image_b, differences, show_count, source, status)
VALUES
  ('official-001', 'spot_diff',
   '找不同：海边小镇',
   '找出左右两图的所有不同之处，点击差异位置即可。',
   'https://picsum.photos/seed/official-001/800/600',
   'https://picsum.photos/seed/official-001-b/800/600',
   '[{"type":"circle","x":150,"y":120,"radius":30},{"type":"circle","x":420,"y":300,"radius":25},{"type":"rect","x":600,"y":450,"width":50,"height":40}]',
   1, 'official', 'approved');

-- 2) spot_diff — 3 differences (rect + circle mix), count visible
INSERT OR IGNORE INTO questions
  (id, mode, title, description, image_a, image_b, differences, show_count, source, status)
VALUES
  ('official-002', 'spot_diff',
   '找不同：森林小屋',
   '左右两图一共有 3 处不同，全部找出来吧！',
   'https://picsum.photos/seed/official-002/800/600',
   'https://picsum.photos/seed/official-002-b/800/600',
   '[{"type":"rect","x":100,"y":200,"width":60,"height":45},{"type":"circle","x":350,"y":150,"radius":35},{"type":"circle","x":650,"y":250,"radius":28}]',
   1, 'official', 'approved');

-- 3) spot_diff — 2 differences, count HIDDEN (HUD shows "还有差异未找到")
INSERT OR IGNORE INTO questions
  (id, mode, title, description, image_a, image_b, differences, show_count, source, status)
VALUES
  ('official-003', 'spot_diff',
   '找不同：城市夜景',
   '这次的差异数量保密，仔细对比左右两图！',
   'https://picsum.photos/seed/official-003/800/600',
   'https://picsum.photos/seed/official-003-b/800/600',
   '[{"type":"circle","x":250,"y":350,"radius":40},{"type":"rect","x":500,"y":120,"width":70,"height":50}]',
   0, 'official', 'approved');

-- 4) find_area — 2 tap zones, count visible
INSERT OR IGNORE INTO questions
  (id, mode, title, description, image_a, image_b, differences, show_count, source, status)
VALUES
  ('official-004', 'find_area',
   '区域识别：果园采摘',
   '点击图中所有苹果所在的位置。',
   'https://picsum.photos/seed/official-004/800/600',
   NULL,
   '[{"type":"circle","x":200,"y":300,"radius":40},{"type":"circle","x":550,"y":420,"radius":45}]',
   1, 'official', 'approved');

-- 5) find_area — 3 tap zones, count HIDDEN
INSERT OR IGNORE INTO questions
  (id, mode, title, description, image_a, image_b, differences, show_count, source, status)
VALUES
  ('official-005', 'find_area',
   '区域识别：星空探索',
   '在图中找到所有星星的位置，数量不告诉你哦。',
   'https://picsum.photos/seed/official-005/800/600',
   NULL,
   '[{"type":"circle","x":120,"y":450,"radius":35},{"type":"rect","x":400,"y":250,"width":50,"height":50},{"type":"circle","x":650,"y":500,"radius":30}]',
   0, 'official', 'approved');

-- Stable, evenly spread keys keep a freshly seeded database from clustering
-- every row at the migration column's compatibility default.
UPDATE questions SET random_key = 0.10 WHERE id = 'official-001';
UPDATE questions SET random_key = 0.30 WHERE id = 'official-002';
UPDATE questions SET random_key = 0.50 WHERE id = 'official-003';
UPDATE questions SET random_key = 0.70 WHERE id = 'official-004';
UPDATE questions SET random_key = 0.90 WHERE id = 'official-005';
