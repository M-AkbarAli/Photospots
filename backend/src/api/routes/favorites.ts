import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// All favorites routes require auth
router.use(requireAuth);

/**
 * GET /v1/favorites
 * Get user's favorites (TODO: implement with auth)
 */
router.get('/', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Favorites endpoint - requires authentication',
    data: [],
  });
});

/**
 * POST /v1/favorites/:spotId
 * Add spot to favorites (TODO: implement with auth)
 */
router.post('/:spotId', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Not implemented',
    message: 'Favorites will be implemented with Supabase Auth integration',
  });
});

/**
 * DELETE /v1/favorites/:spotId
 * Remove spot from favorites (TODO: implement with auth)
 */
router.delete('/:spotId', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Not implemented',
    message: 'Favorites will be implemented with Supabase Auth integration',
  });
});

export default router;
