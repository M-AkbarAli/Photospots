import { supabase } from '../config/supabase.js';
import type { CreateSpotInput, Spot, SpotWithDistance } from '../types/spot.js';
import { CACHE_TTL, getCache, getCacheKey, setCache } from '../utils/cache.js';

export class SpotService {
  /**
   * Get nearby spots with caching
   */
  async getNearbySpots(
    lat: number,
    lng: number,
    radius: number = 5000
  ): Promise<SpotWithDistance[]> {
    const cacheKey = getCacheKey.nearbySpots(lat, lng, radius);
    
    // Try cache first
    const cached = await getCache<SpotWithDistance[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Call RPC function
    const { data, error } = await supabase.rpc('api_spots_nearby', {
      lat,
      lng,
      radius_m: radius,
      result_limit: 200,
    });

    if (error) {
      throw new Error(`Failed to fetch nearby spots: ${error.message}`);
    }

    const spots = data as SpotWithDistance[];
    
    // Cache the result
    await setCache(cacheKey, spots, CACHE_TTL.NEARBY_SPOTS);

    return spots;
  }

  /**
   * Get spot by ID with caching
   */
  async getSpotById(spotId: string): Promise<Spot | null> {
    const cacheKey = getCacheKey.spotDetail(spotId);
    
    // Try cache first
    const cached = await getCache<Spot>(cacheKey);
    if (cached) {
      return cached;
    }

    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .eq('id', spotId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch spot: ${error.message}`);
    }

    const spot = data as Spot;
    
    // Cache the result
    await setCache(cacheKey, spot, CACHE_TTL.SPOT_DETAIL);

    return spot;
  }

  /**
   * Search spots with optional geo bias
   */
  async searchSpots(
    query: string,
    lat?: number,
    lng?: number
  ): Promise<SpotWithDistance[]> {
    const cacheKey = getCacheKey.searchResults(query, lat, lng);
    
    // Try cache first
    const cached = await getCache<SpotWithDistance[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const { data, error } = await supabase.rpc('api_spots_search', {
      search_query: query,
      lat: lat || null,
      lng: lng || null,
      result_limit: 50,
    });

    if (error) {
      throw new Error(`Failed to search spots: ${error.message}`);
    }

    const spots = data as SpotWithDistance[];
    
    // Cache the result
    await setCache(cacheKey, spots, CACHE_TTL.SEARCH_RESULTS);

    return spots;
  }

  /**
   * Create a new spot (UGC)
   */
  async createSpot(input: CreateSpotInput): Promise<Spot> {
    const { data, error } = await supabase
      .from('spots')
      .insert({
        name: input.name,
        lat: input.lat,
        lng: input.lng,
        geom: `POINT(${input.lng} ${input.lat})`,
        source: input.source,
        categories: input.categories || [],
        description: input.description,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create spot: ${error.message}`);
    }

    return data as Spot;
  }

  /**
   * Update spot score
   */
  async updateSpotScore(spotId: string, score: number): Promise<void> {
    const { error } = await supabase
      .from('spots')
      .update({ score })
      .eq('id', spotId);

    if (error) {
      throw new Error(`Failed to update spot score: ${error.message}`);
    }
  }
}
