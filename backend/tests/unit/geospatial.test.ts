import { calculateDistance, isPointInPolygon } from '../../src/utils/geospatial';

describe('Geospatial Utilities', () => {
    describe('calculateDistance', () => {
        it('should calculate the correct distance between two points', () => {
            const pointA = { lat: 40.7128, lon: -74.0060 }; // New York
            const pointB = { lat: 34.0522, lon: -118.2437 }; // Los Angeles
            const distance = calculateDistance(pointA, pointB);
            expect(distance).toBeCloseTo(3936.9, 1); // Distance in kilometers
        });

        it('should return 0 for the same point', () => {
            const point = { lat: 40.7128, lon: -74.0060 };
            const distance = calculateDistance(point, point);
            expect(distance).toBe(0);
        });
    });

    describe('isPointInPolygon', () => {
        it('should return true if the point is inside the polygon', () => {
            const point = { lat: 40.7128, lon: -74.0060 }; // New York
            const polygon = [
                { lat: 40.730610, lon: -73.935242 },
                { lat: 40.750610, lon: -73.935242 },
                { lat: 40.750610, lon: -74.0060 },
                { lat: 40.730610, lon: -74.0060 },
            ];
            const result = isPointInPolygon(point, polygon);
            expect(result).toBe(true);
        });

        it('should return false if the point is outside the polygon', () => {
            const point = { lat: 40.7128, lon: -74.0060 }; // New York
            const polygon = [
                { lat: 40.730610, lon: -73.935242 },
                { lat: 40.750610, lon: -73.935242 },
                { lat: 40.750610, lon: -74.0060 },
                { lat: 40.730610, lon: -74.0060 },
            ];
            const result = isPointInPolygon(point, polygon);
            expect(result).toBe(false);
        });
    });
});