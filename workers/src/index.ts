import { cors } from 'hono/cors';
import { Hono } from 'hono';
import type { AppBindings } from './bindings';
import { imagesRoutes } from './routes/images';
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

// Bound services: D1 via c.env.DB, R2 via c.env.IMAGES.

app.route('/', workshopRoutes);
app.route('/', questionsRoutes);
app.route('/', ratingsRoutes);
app.route('/', imagesRoutes);

export default app;
