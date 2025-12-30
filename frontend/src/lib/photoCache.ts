import type { Photo } from '../types/api';

/**
 * Simple in-memory cache for landmark photos.
 * This allows the photo gallery screen to reuse photos
 * fetched by the details sheet without re-fetching.
 */

interface CachedPhotos {
  photos: Photo[];
  timestamp: number;
  errors: number;
}

const photoCache = new Map<string, CachedPhotos>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedPhotos(landmarkId: string): CachedPhotos | null {
  const cached = photoCache.get(landmarkId);
  if (!cached) return null;

  // Check if cache is expired
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    photoCache.delete(landmarkId);
    return null;
  }

  return cached;
}

export function setCachedPhotos(
  landmarkId: string,
  photos: Photo[],
  errors: number = 0
): void {
  photoCache.set(landmarkId, {
    photos,
    timestamp: Date.now(),
    errors,
  });
}

export function clearPhotoCache(): void {
  photoCache.clear();
}

export function invalidateLandmarkPhotos(landmarkId: string): void {
  photoCache.delete(landmarkId);
}
