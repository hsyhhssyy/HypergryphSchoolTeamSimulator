import { cors } from 'hono/cors';
import { Hono } from 'hono';
import type { AppBindings } from './bindings';
import { questionsRoutes } from './routes/questions';
import { ratingsRoutes } from './routes/ratings';
import { workshopRoutes } from './routes/workshop';

const app = new Hono<{ Bindings: AppBindings }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  })
);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// --- Real routes (todos 16-19). Stubs below remain until their todo lands. ---
// Bound services: D1 via c.env.DB, R2 via c.env.IMAGES.

app.route('/', workshopRoutes);
app.route('/', questionsRoutes);
app.route('/', ratingsRoutes);

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
