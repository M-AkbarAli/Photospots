import { redisClient } from '../config/redis.js';

/**
 * Cache TTLs in seconds
 */
export const CACHE_TTL = {
  NEARBY_SPOTS: 300,      // 5 minutes
  SPOT_DETAIL: 600,       // 10 minutes
  POPULAR_SPOTS: 600,     // 10 minutes
  SEARCH_RESULTS: 180,    // 3 minutes
} as const;

/**
 * Generate cache key for nearby spots
 */
export const getCacheKey = {
  nearbySpots: (lat: number, lng: number, radius: number): string => {
    const latBucket = Math.floor(lat * 100) / 100;
    const lngBucket = Math.floor(lng * 100) / 100;
    return `nearby:${latBucket}:${lngBucket}:${radius}`;
  },
  
  spotDetail: (spotId: string): string => {
    return `spot:${spotId}`;
  },
  
  popularSpots: (bbox?: string): string => {
    return bbox ? `popular:${bbox}` : 'popular:global';
  },
  
  searchResults: (query: string, lat?: number, lng?: number): string => {
    const location = lat && lng ? `:${Math.floor(lat * 10)}:${Math.floor(lng * 10)}` : '';
    return `search:${query}${location}`;
  },
};

/**
 * Get cached data
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set cache data with TTL
 */
export async function setCache(
  key: string,
  data: any,
  ttl: number = CACHE_TTL.NEARBY_SPOTS
): Promise<void> {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

/**
 * Clear all cache
 */
export async function clearCache(): Promise<void> {
  try {
    await redisClient.flushDb();
  } catch (error) {
    console.error('Cache clear error:', error);
  }
}
