import { Router, type Request, type Response } from 'express';

const router = Router();

/**
 * GET /v1/photos
 * List photos (TODO: implement)
 */
router.get('/', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Photos endpoint - coming soon',
    data: [],
  });
});

/**
 * POST /v1/photos
 * Upload a photo (TODO: implement with Supabase Storage)
 */
router.post('/', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Not implemented',
    message: 'Photo upload will be implemented with Supabase Storage integration',
  });
});

export default router;
