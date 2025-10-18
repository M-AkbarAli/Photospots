import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// GET /v1/auth/me - returns current authenticated user (id, email)
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// POST /v1/auth/logout - placeholder (client should clear token)
router.post('/logout', (_req: Request, res: Response) => {
  // Tokens are stateless JWTs; to "logout" the client removes the token.
  res.json({ success: true });
});

export default router;
