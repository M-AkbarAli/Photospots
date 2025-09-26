import { Router } from 'express';
import authRoutes from './auth';
import hotspotRoutes from './hotspots';
import photoRoutes from './photos';
import searchRoutes from './search';

const router = Router();

router.use('/auth', authRoutes);
router.use('/hotspots', hotspotRoutes);
router.use('/photos', photoRoutes);
router.use('/search', searchRoutes);

export default router;