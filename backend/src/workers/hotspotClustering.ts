import { Photo } from '../types/photo';
import { Hotspot } from '../types/hotspot';
import { dbscan } from '../utils/clustering/dbscan';
import { getPhotosFromDatabase } from '../services/hotspotService';
import { calculateHotspotScore } from '../services/scoringService';

export const clusterHotspots = async (): Promise<Hotspot[]> => {
    // Step 1: Fetch geotagged photos from the database
    const photos: Photo[] = await getPhotosFromDatabase();

    // Step 2: Extract coordinates from photos
    const coordinates = photos.map(photo => ({
        latitude: photo.latitude,
        longitude: photo.longitude,
        id: photo.id,
    }));

    // Step 3: Perform DBSCAN clustering
    const clusters = dbscan(coordinates, 50, 5); // Adjust parameters as needed

    // Step 4: Create hotspots from clusters
    const hotspots: Hotspot[] = clusters.map(cluster => {
        const centroid = calculateCentroid(cluster);
        const score = calculateHotspotScore(cluster);
        return {
            id: generateHotspotId(),
            latitude: centroid.latitude,
            longitude: centroid.longitude,
            score,
            photoIds: cluster.map(photo => photo.id),
        };
    });

    // Step 5: Save hotspots to the database (implementation not shown)
    await saveHotspotsToDatabase(hotspots);

    return hotspots;
};

const calculateCentroid = (cluster: { latitude: number; longitude: number; id: string }[]): { latitude: number; longitude: number } => {
    const total = cluster.length;
    const sum = cluster.reduce((acc, photo) => {
        acc.latitude += photo.latitude;
        acc.longitude += photo.longitude;
        return acc;
    }, { latitude: 0, longitude: 0 });

    return {
        latitude: sum.latitude / total,
        longitude: sum.longitude / total,
    };
};

const generateHotspotId = (): string => {
    return 'hotspot_' + Date.now(); // Simple ID generation, consider using a more robust method
};

const saveHotspotsToDatabase = async (hotspots: Hotspot[]): Promise<void> => {
    // Implementation for saving hotspots to the database
};