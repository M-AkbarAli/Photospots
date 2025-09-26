import { DBSCAN } from './dbscan';
import { Photo } from '../../types/photo';
import { Hotspot } from '../../types/hotspot';

/**
 * Clusters an array of geotagged photos into hotspots using the DBSCAN algorithm.
 * @param photos - An array of geotagged photos to be clustered.
 * @param eps - The maximum distance between two samples for them to be considered as in the same neighborhood.
 * @param minSamples - The number of samples in a neighborhood for a point to be considered as a core point.
 * @returns An array of hotspots, each containing a centroid and the list of photos in that cluster.
 */
export function clusterPhotos(photos: Photo[], eps: number, minSamples: number): Hotspot[] {
    const clusters = DBSCAN(photos, eps, minSamples);
    return clusters.map(cluster => {
        const centroid = calculateCentroid(cluster);
        return {
            centroid,
            photos: cluster,
        };
    });
}

/**
 * Calculates the centroid of a cluster of photos.
 * @param cluster - An array of photos in the cluster.
 * @returns The centroid coordinates as an object with latitude and longitude.
 */
function calculateCentroid(cluster: Photo[]): { lat: number; lon: number } {
    const latSum = cluster.reduce((sum, photo) => sum + photo.latitude, 0);
    const lonSum = cluster.reduce((sum, photo) => sum + photo.longitude, 0);
    const count = cluster.length;

    return {
        lat: latSum / count,
        lon: lonSum / count,
    };
}