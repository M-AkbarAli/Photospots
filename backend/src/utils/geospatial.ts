/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Validate latitude value
 */
export function isValidLatitude(lat: number): boolean {
  return typeof lat === 'number' && lat >= -90 && lat <= 90;
}

/**
 * Validate longitude value
 */
export function isValidLongitude(lng: number): boolean {
  return typeof lng === 'number' && lng >= -180 && lng <= 180;
}

/**
 * Validate coordinate pair
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}

/**
 * Calculate bounding box around a point
 * @param lat - Latitude
 * @param lng - Longitude
 * @param radiusMeters - Radius in meters
 * @returns Bounding box [minLat, minLng, maxLat, maxLng]
 */
export function getBoundingBox(
  lat: number,
  lng: number,
  radiusMeters: number
): [number, number, number, number] {
  const latDelta = (radiusMeters / 111320); // 1 degree latitude ≈ 111.32 km
  const lngDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  return [
    lat - latDelta,  // minLat
    lng - lngDelta,  // minLng
    lat + latDelta,  // maxLat
    lng + lngDelta,  // maxLng
  ];
}

/**
 * Format coordinates for display
 */
export function formatCoordinate(lat: number, lng: number, precision: number = 6): string {
  return `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
}
