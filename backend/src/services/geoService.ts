import { Pool } from 'pg';
import Redis from 'ioredis';
import { getDistance } from 'geolib';
import { Hotspot } from '../types/hotspot';
import { Photo } from '../types/photo';
import { supabase } from '../config/supabase';
import { redis } from '../config/redis';

const redisClient = new Redis(redis.url);
const dbPool = new Pool();

export const fetchGeotaggedPhotos = async (bbox: string): Promise<Photo[]> => {
    const { data, error } = await supabase
        .from('photos')
        .select('*')
        .filter('bbox', 'cs', bbox);

    if (error) {
        throw new Error(`Error fetching photos: ${error.message}`);
    }

    return data;
};

export const calculateDistance = (point1: { lat: number; lon: number }, point2: { lat: number; lon: number }): number => {
    return getDistance(point1, point2);
};

export const clusterHotspots = async (photos: Photo[]): Promise<Hotspot[]> => {
    // Implement clustering logic here, e.g., using DBSCAN or another algorithm
    const hotspots: Hotspot[] = [];

    // Example clustering logic (to be replaced with actual implementation)
    photos.forEach(photo => {
        const existingHotspot = hotspots.find(h => h.location === photo.location);
        if (existingHotspot) {
            existingHotspot.photos.push(photo);
        } else {
            hotspots.push({ location: photo.location, photos: [photo] });
        }
    });

    return hotspots;
};

export const cacheHotspotData = async (hotspotId: string, data: Hotspot): Promise<void> => {
    await redisClient.set(`hotspot:${hotspotId}`, JSON.stringify(data));
};

export const getCachedHotspotData = async (hotspotId: string): Promise<Hotspot | null> => {
    const cachedData = await redisClient.get(`hotspot:${hotspotId}`);
    return cachedData ? JSON.parse(cachedData) : null;
};