import { fetchGeotaggedPhotos } from '../services/flickrService';
import { savePhotosToDatabase } from '../services/photoProcessingService';
import { RedisClient } from 'redis';
import { supabase } from '../config/supabase';
import { redisClient } from '../config/redis';

const PHOTO_INGESTION_INTERVAL = 3600000; // 1 hour

async function ingestPhotos() {
    try {
        const photos = await fetchGeotaggedPhotos();
        await savePhotosToDatabase(photos);
        console.log(`Ingested ${photos.length} photos into the database.`);
    } catch (error) {
        console.error('Error ingesting photos:', error);
    }
}

function startPhotoIngestionWorker() {
    ingestPhotos();
    setInterval(ingestPhotos, PHOTO_INGESTION_INTERVAL);
}

export { startPhotoIngestionWorker };