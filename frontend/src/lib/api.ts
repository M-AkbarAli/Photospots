import type { ApiResponse, Photo, Spot } from '../types/api';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * Normalizes image URLs:
 * - Converts http:// to https:// (required for iOS ATS compliance)
 * - Leaves localhost/127.0.0.1 as http for local dev
 * - Returns null for empty/invalid URLs
 */
export function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol === 'http:' && !isLocal) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    // Fallback string replace for non-standard URLs
    if (trimmed.startsWith('http://') &&
        !trimmed.includes('localhost') &&
        !trimmed.includes('127.0.0.1')) {
      return trimmed.replace('http://', 'https://');
    }
    return trimmed;
  }
}

/**
 * Picks the best available photo URL from variants, preferring larger sizes.
 */
export function getPreferredPhotoUrl(variants: Record<string, any> | null | undefined): string | null {
  if (!variants) return null;
  const candidates = [
    'url_l', 'url_o', 'url_c', 'url_z', 'url_m', 'url_s', 'url_b',
    'large', 'original', 'medium', 'small'
  ];
  for (const key of candidates) {
    const candidate = variants[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      const normalized = normalizeImageUrl(candidate);
      if (normalized) return normalized;
    }
  }
  return null;
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | undefined>
): string {
  const url = new URL(path, BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const json: ApiResponse<T> = await response.json();
  if (!json.success) {
    throw new Error('API returned success=false');
  }
  return json.data;
}

function getSpotCompletenessScore(spot: Spot): number {
  let score = 0;
  if (spot.photoUrl) score += 2;
  if (spot.description) score += 2;
  if (spot.categories?.length) score += 1;
  if (spot.distanceMeters !== undefined) score += 1;
  if (spot.score !== undefined && spot.score !== null) score += 1;
  return score;
}

function dedupeSpots(spots: Spot[]): Spot[] {
  const byId = new Map<string, Spot>();

  for (const spot of spots) {
    if (!spot?.id) continue;
    const existing = byId.get(spot.id);
    if (!existing) {
      byId.set(spot.id, spot);
      continue;
    }

    const existingScore = getSpotCompletenessScore(existing);
    const nextScore = getSpotCompletenessScore(spot);
    byId.set(spot.id, nextScore > existingScore ? spot : existing);
  }

  return Array.from(byId.values());
}

export async function getNearbySpots(
  lat: number,
  lng: number,
  radiusMeters: number = 1500
): Promise<Spot[]> {
  const url = buildUrl('/v1/spots/nearby', { lat, lng, radiusMeters });
  const spots = await fetchJson<Spot[]>(url);
  return dedupeSpots(spots);
}

export async function searchSpots(
  q: string,
  lat?: number,
  lng?: number
): Promise<Spot[]> {
  const url = buildUrl('/v1/spots/search', { q, lat, lng });
  const spots = await fetchJson<Spot[]>(url);
  return dedupeSpots(spots);
}

export async function getSpotById(id: string): Promise<Spot> {
  const url = buildUrl(`/v1/spots/${id}`);
  return fetchJson<Spot>(url);
}

export async function getSpotPhotos(spotId: string): Promise<Photo[]> {
  const url = buildUrl(`/v1/spots/${spotId}/photos`);
  return fetchJson<Photo[]>(url);
}

/**
 * Get hotspots near a landmark. Returns an array of Spot objects.
 */
export async function getSpotHotspots(landmarkId: string): Promise<Spot[]> {
  const url = buildUrl(`/v1/spots/${landmarkId}/hotspots`);
  return fetchJson<Spot[]>(url);
}

/**
 * Filter spots to only include landmarks (categories includes "landmark").
 */
export function filterLandmarks(spots: Spot[]): Spot[] {
  return spots.filter(
    (spot) => spot.categories?.some((cat) => cat.toLowerCase() === 'landmark')
  );
}

/**
 * Aggregate photos from multiple hotspots with concurrency limit.
 * Returns a flat array of unique photos, sorted by createdAt desc.
 */
export async function aggregateHotspotPhotos(
  hotspots: Spot[],
  options: { maxHotspots?: number; maxPhotos?: number; concurrency?: number } = {}
): Promise<{ photos: Photo[]; errors: number }> {
  const { maxHotspots = 20, maxPhotos = 60, concurrency = 4 } = options;
  const limitedHotspots = hotspots.slice(0, maxHotspots);
  
  const allPhotos: Photo[] = [];
  let errorCount = 0;
  
  // Process in batches with concurrency limit
  for (let i = 0; i < limitedHotspots.length; i += concurrency) {
    const batch = limitedHotspots.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((hotspot) => getSpotPhotos(hotspot.id))
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allPhotos.push(...result.value);
      } else {
        errorCount++;
      }
    }
    
    // Early exit if we have enough photos
    if (allPhotos.length >= maxPhotos * 1.5) break;
  }
  
  // Dedupe by photo id and url_l
  const seen = new Set<string>();
  const uniquePhotos = allPhotos.filter((photo) => {
    const key = photo.id || photo.variants?.url_l;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Sort by createdAt desc
  uniquePhotos.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
  
  return {
    photos: uniquePhotos.slice(0, maxPhotos),
    errors: errorCount,
  };
}
