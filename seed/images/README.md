# Official question images — placeholder strategy

The 5 official seed questions (todo 5) do **not** ship real artwork. Instead
each row points at deterministic placeholder photos served by
[picsum.photos](https://picsum.photos/):

| Question | `image_a` | `image_b` |
| --- | --- | --- |
| official-001 … official-005 | `https://picsum.photos/seed/<id>/800/600` | `https://picsum.photos/seed/<id>-b/800/600` (spot_diff only) |

## Why placeholders

1. **No copyright risk** — v1 must not embed or hotlink real/copyrighted
   images. Picsum photos are permissively licensed (Unsplash-sourced) and
   requested via a plain HTTPS URL, so the D1 rows stay tiny (no base64 in
   SQL, no binary blobs).
2. **Deterministic** — the `/seed/<seed>` endpoint always returns the same
   photo for the same seed string. Gameplay (hit testing, E2E, screenshot
   diffs) therefore behaves identically on every run, and each question's two
   panels (`<id>` vs `<id>-b`) are *different but stable* images, as the spot-
   diff mode requires.
3. **Correct dimensions** — `/800/600` forces an 800×600 canvas, which is the
   native-pixel space all `differences` coordinates are authored against.

## Swapping in real assets later

When real artwork is ready (plan decision #5):

1. Replace `image_a` / `image_b` URLs in
   `seed/official-questions.sql` (or run an `UPDATE questions SET image_a=…
   WHERE id='official-001'` for an already-seeded DB).
2. Keep the replacement images at **800×600** — or re-author every
   `differences` coordinate in the same native pixel space as the new image.
3. Preferred hosts: the project's own R2 bucket via the `/images/:filename`
   route, or any CDN you control. Do not hotlink third-party art, and do not
   embed base64 in SQL.
