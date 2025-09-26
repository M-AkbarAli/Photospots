import { LatLng } from '../types/hotspot';

/**
 * Calculates the distance between two geographical points using the Haversine formula.
 * @param {LatLng} point1 - The first point with latitude and longitude.
 * @param {LatLng} point2 - The second point with latitude and longitude.
 * @returns {number} - The distance in kilometers between the two points.
 */
export function haversineDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = degreesToRadians(point2.lat - point1.lat);
    const dLon = degreesToRadians(point2.lng - point1.lng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(degreesToRadians(point1.lat)) * Math.cos(degreesToRadians(point2.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
}

/**
 * Converts degrees to radians.
 * @param {number} degrees - The angle in degrees.
 * @returns {number} - The angle in radians.
 */
function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Checks if a point is within a specified radius of another point.
 * @param {LatLng} center - The center point.
 * @param {LatLng} point - The point to check.
 * @param {number} radius - The radius in kilometers.
 * @returns {boolean} - True if the point is within the radius, false otherwise.
 */
export function isWithinRadius(center: LatLng, point: LatLng, radius: number): boolean {
    const distance = haversineDistance(center, point);
    return distance <= radius;
}