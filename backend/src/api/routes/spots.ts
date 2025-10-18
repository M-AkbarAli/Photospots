import { Router, type Request, type Response } from 'express';
import { SpotService } from '../../services/spotService.js';
import { isValidCoordinate } from '../../utils/geospatial.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
const spotService = new SpotService();

/**
 * GET /v1/spots/nearby
 * Get nearby spots
 */
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseInt(req.query.radius as string) || 5000;

    if (!isValidCoordinate(lat, lng)) {
      return res.status(400).json({ 
        error: 'Invalid coordinates',
        message: 'lat must be between -90 and 90, lng between -180 and 180',
      });
    }

    if (radius < 100 || radius > 50000) {
      return res.status(400).json({ 
        error: 'Invalid radius',
        message: 'radius must be between 100 and 50000 meters',
      });
    }

    const spots = await spotService.getNearbySpots(lat, lng, radius);
    
    res.json({
      success: true,
      count: spots.length,
      data: spots,
    });
  } catch (error) {
    console.error('Error fetching nearby spots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch nearby spots',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/spots/search
 * Search spots
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Invalid query',
        message: 'Search query must be at least 2 characters',
      });
    }

    if ((lat && !lng) || (!lat && lng)) {
      return res.status(400).json({ 
        error: 'Invalid coordinates',
        message: 'Both lat and lng must be provided together',
      });
    }

    if (lat !== undefined && lng !== undefined && !isValidCoordinate(lat, lng)) {
      return res.status(400).json({ 
        error: 'Invalid coordinates',
        message: 'lat must be between -90 and 90, lng between -180 and 180',
      });
    }

    const spots = await spotService.searchSpots(query, lat, lng);
    
    res.json({
      success: true,
      count: spots.length,
      query,
      data: spots,
    });
  } catch (error) {
    console.error('Error searching spots:', error);
    res.status(500).json({ 
      error: 'Failed to search spots',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/spots/:id
 * Get spot by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const spot = await spotService.getSpotById(id);
    
    if (!spot) {
      return res.status(404).json({ 
        error: 'Spot not found',
      });
    }

    res.json({
      success: true,
      data: spot,
    });
  } catch (error) {
    console.error('Error fetching spot:', error);
    res.status(500).json({ 
      error: 'Failed to fetch spot',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /v1/spots
 * Create a new spot (requires auth - TODO: add auth middleware)
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, lat, lng, categories, description } = req.body;

    if (!name || !lat || !lng) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'name, lat, and lng are required',
      });
    }

    if (!isValidCoordinate(lat, lng)) {
      return res.status(400).json({ 
        error: 'Invalid coordinates',
        message: 'lat must be between -90 and 90, lng between -180 and 180',
      });
    }

    const spot = await spotService.createSpot({
      name,
      lat,
      lng,
      source: 'ugc',
      categories,
      description,
    });

    res.status(201).json({
      success: true,
      data: spot,
    });
  } catch (error) {
    console.error('Error creating spot:', error);
    res.status(500).json({ 
      error: 'Failed to create spot',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
