import { clusterHotspots } from '../../src/utils/clustering';
import { Hotspot } from '../../src/types/hotspot';

describe('Clustering Utilities', () => {
    it('should cluster hotspots correctly based on geolocation', () => {
        const hotspots: Hotspot[] = [
            { id: 1, latitude: 37.7749, longitude: -122.4194, tags: ['city', 'urban'] },
            { id: 2, latitude: 37.7750, longitude: -122.4195, tags: ['city', 'urban'] },
            { id: 3, latitude: 37.7755, longitude: -122.4200, tags: ['nature', 'park'] },
            { id: 4, latitude: 37.7760, longitude: -122.4210, tags: ['nature', 'park'] },
        ];

        const clusters = clusterHotspots(hotspots, 0.01); // Assuming 0.01 degrees is the distance threshold

        expect(clusters.length).toBe(2); // Expecting two clusters
        expect(clusters[0].hotspots.length).toBe(2); // First cluster should have 2 hotspots
        expect(clusters[1].hotspots.length).toBe(2); // Second cluster should have 2 hotspots
    });

    it('should return an empty array when no hotspots are provided', () => {
        const clusters = clusterHotspots([], 0.01);
        expect(clusters.length).toBe(0);
    });

    it('should handle hotspots that are too far apart', () => {
        const hotspots: Hotspot[] = [
            { id: 1, latitude: 37.7749, longitude: -122.4194, tags: ['city'] },
            { id: 2, latitude: 38.7749, longitude: -123.4194, tags: ['nature'] },
        ];

        const clusters = clusterHotspots(hotspots, 0.01); // Assuming 0.01 degrees is the distance threshold
        expect(clusters.length).toBe(2); // Each hotspot should be its own cluster
    });
});