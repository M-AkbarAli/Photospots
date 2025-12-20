import type { ApiResponse, Photo, Spot } from '../types/api';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8080';

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

export async function getNearbySpots(
  lat: number,
  lng: number,
  radiusMeters: number = 1500
): Promise<Spot[]> {
  const url = buildUrl('/v1/spots/nearby', { lat, lng, radiusMeters });
  return fetchJson<Spot[]>(url);
}

export async function searchSpots(
  q: string,
  lat?: number,
  lng?: number
): Promise<Spot[]> {
  const url = buildUrl('/v1/spots/search', { q, lat, lng });
  return fetchJson<Spot[]>(url);
}

export async function getSpotById(id: string): Promise<Spot> {
  const url = buildUrl(`/v1/spots/${id}`);
  return fetchJson<Spot>(url);
}

export async function getSpotPhotos(spotId: string): Promise<Photo[]> {
  const url = buildUrl(`/v1/spots/${spotId}/photos`);
  return fetchJson<Photo[]>(url);
}
