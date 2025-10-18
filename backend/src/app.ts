import cors from 'cors';
import dotenv from 'dotenv';
import express, { type Express, type Request, type Response } from 'express';
import favoritesRouter from './api/routes/favorites.js';
import photosRouter from './api/routes/photos.js';
import spotsRouter from './api/routes/spots.js';
import { config } from './config/index.js';
import { connectRedis } from './config/redis.js';

dotenv.config();

const app: Express = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: config.env,
  });
});

// API routes
app.use('/v1/spots', spotsRouter);
app.use('/v1/photos', photosRouter);
app.use('/v1/favorites', favoritesRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.env === 'development' ? err.message : undefined,
  });
});

// Start server
async function startServer() {
  try {
    // Connect to Redis
    await connectRedis();
    console.log('✓ Redis connected');

    // Start Express server
    app.listen(config.port, () => {
      console.log(`✓ Server running on http://localhost:${config.port}`);
      console.log(`  Environment: ${config.env}`);
      console.log(`  Health check: http://localhost:${config.port}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
