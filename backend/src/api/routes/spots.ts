import { Router, type Request, type Response } from 'express';
import { SpotService } from '../../services/spotService.js';
import { isValidCoordinate } from '../../utils/geospatial.js';
import { requireAuth } from '../middlewares/auth.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { getCache, setCache, CACHE_TTL } from '../../utils/cache.js';

const router = Router();
const spotService = new SpotService();
const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

/**
 * GET /v1/spots/nearby
 * Get nearby spots
 */
router.get('/nearby', async (req: Request, res: Response): Promise<void> => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseInt(req.query.radius as string) || 5000;

    if (!isValidCoordinate(lat, lng)) {
      res.status(400).json({ 
        error: 'Invalid coordinates',
        message: 'lat must be between -90 and 90, lng between -180 and 180',
      });
      return;
    }

    if (radius < 100 || radius > 50000) {
      res.status(400).json({ 
        error: 'Invalid radius',
        message: 'radius must be between 100 and 50000 meters',
      });
      return;
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
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;

    if (!query || query.trim().length < 2) {
      res.status(400).json({ 
        error: 'Invalid query',
        message: 'Search query must be at least 2 characters',
      });
      return;
    }

    if ((lat && !lng) || (!lat && lng)) {
      res.status(400).json({ 
        error: 'Invalid coordinates',
        message: 'Both lat and lng must be provided together',
      });
      return;
    }

    if (lat !== undefined && lng !== undefined && !isValidCoordinate(lat, lng)) {
      res.status(400).json({ 
        error: 'Invalid coordinates',
        message: 'lat must be between -90 and 90, lng between -180 and 180',
      });
      return;
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
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const spot = await spotService.getSpotById(id);
    
    if (!spot) {
      res.status(404).json({ 
        error: 'Spot not found',
      });
      return;
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
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, lat, lng, categories, description } = req.body;

    if (!name || !lat || !lng) {
      res.status(400).json({ 
        error: 'Missing required fields',
        message: 'name, lat, and lng are required',
      });
      return;
    }

    if (!isValidCoordinate(lat, lng)) {
      res.status(400).json({ 
        error: 'Invalid coordinates',
        message: 'lat must be between -90 and 90, lng between -180 and 180',
      });
      return;
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

/**
 * GET /v1/spots/:landmarkId/hotspots
 * Get all photography hotspots for a specific landmark
 * 
 * Response:
 * {
 *   "success": true,
 *   "hotspots": [...]
 * }
 */
router.get('/:landmarkId/hotspots', async (req: Request, res: Response): Promise<void> => {
  try {
    const { landmarkId } = req.params;

    // Check cache first
    const cacheKey = `hotspots:${landmarkId}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // First, get the landmark details
    const { data: landmark, error: landmarkError } = await supabase
      .from('spots')
      .select('lat, lng, name')
      .eq('id', landmarkId)
      .single();

    if (landmarkError || !landmark) {
      res.status(404).json({ 
        error: 'Landmark not found',
      });
      return;
    }

    // Find hotspots within 500m of landmark
    // Use the same parameter names as spotService.getNearbySpots()
    const { data: hotspots, error: hotspotsError } = await supabase
      .rpc('api_spots_nearby', {
        search_lat: landmark.lat,
        search_lng: landmark.lng,
        radius_m: 500,
        result_limit: 200,
      });

    if (hotspotsError) {
      console.error('Error fetching hotspots:', hotspotsError);
      res.status(500).json({ 
        error: 'Failed to fetch hotspots',
        message: hotspotsError.message,
      });
      return;
    }

    // Filter to only hotspots (not other landmarks)
    // Hotspots are identified by having 'hotspot' in their categories
    const filteredHotspots = (hotspots || []).filter((s: any) => 
      s.categories?.includes('hotspot') && s.id !== landmarkId
    );

    const response = {
      success: true,
      landmark: {
        id: landmarkId,
        name: landmark.name,
      },
      count: filteredHotspots.length,
      hotspots: filteredHotspots,
    };

    // Cache the result (5 minutes TTL)
    await setCache(cacheKey, response, CACHE_TTL.NEARBY_SPOTS);

    res.json(response);
  } catch (error) {
    console.error('Error fetching hotspots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch hotspots',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/spots/:spotId/photos
 * Get all photos for a specific spot (hotspot or landmark)
 * 
 * Response:
 * {
 *   "success": true,
 *   "photos": [...]
 * }
 */
router.get('/:spotId/photos', async (req: Request, res: Response): Promise<void> => {
  try {
    const { spotId } = req.params;

    // Check cache first
    const cacheKey = `photos:${spotId}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Fetch all public photos for this spot
    const { data: photos, error } = await supabase
      .from('photos')
      .select('*')
      .eq('spot_id', spotId)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching photos:', error);
      res.status(500).json({ 
        error: 'Failed to fetch photos',
        message: error.message,
      });
      return;
    }

    const response = {
      success: true,
      count: photos?.length || 0,
      photos: photos || [],
    };

    // Cache the result (10 minutes TTL)
    await setCache(cacheKey, response, CACHE_TTL.SPOT_DETAIL);

    res.json(response);
  } catch (error) {
    console.error('Error fetching photos:', error);
    res.status(500).json({ 
      error: 'Failed to fetch photos',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});



export default router;
