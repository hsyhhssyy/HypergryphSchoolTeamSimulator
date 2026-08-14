import { cors } from 'hono/cors';
import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  })
);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// --- Route stubs (todo 6). Real logic lands in todos 16–19. ---
// Bound services: D1 via c.env.DB, R2 via c.env.IMAGES.

app.get('/api/questions', (c) => {
  void c.env.DB;
  return c.json({ error: 'not implemented' }, 501);
});

app.post('/api/workshop', (c) => {
  void c.env.DB;
  return c.json({ error: 'not implemented' }, 501);
});

app.post('/api/ratings', (c) => {
  void c.env.DB;
  return c.json({ error: 'not implemented' }, 501);
});

app.get('/api/workshop/pending', (c) => {
  void c.env.DB;
  return c.json({ error: 'not implemented' }, 501);
});

app.post('/api/workshop/review', (c) => {
  void c.env.DB;
  return c.json({ error: 'not implemented' }, 501);
});

app.get('/images/:filename', (c) => {
  void c.env.IMAGES;
  return c.json({ error: 'not implemented' }, 501);
});

export default app;
