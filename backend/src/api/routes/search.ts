import { Router } from 'express';
import { searchHotspots } from '../controllers/searchController';
import { validateSearchQuery } from '../middlewares/validation';

const router = Router();

// Route for searching hotspots
router.get('/hotspots', validateSearchQuery, searchHotspots);

export default router;