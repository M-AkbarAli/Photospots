import { S3 } from 'aws-sdk';
import { RedisClient } from 'redis';
import { Photo } from '../types/photo';
import { resizeImage } from '../utils/imageUtils'; // Assume this utility function exists

class PhotoProcessingService {
    private s3: S3;
    private redisClient: RedisClient;

    constructor(s3Config: S3.ClientConfiguration, redisClient: RedisClient) {
        this.s3 = new S3(s3Config);
        this.redisClient = redisClient;
    }

    async uploadPhoto(photo: Photo): Promise<string> {
        const resizedPhoto = await resizeImage(photo); // Resize the photo
        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: photo.id, // Use photo ID as the key
            Body: resizedPhoto,
            ContentType: photo.contentType,
        };

        const uploadResult = await this.s3.upload(params).promise();
        return uploadResult.Location; // Return the URL of the uploaded photo
    }

    async cachePhotoMetadata(photo: Photo): Promise<void> {
        const key = `photo:${photo.id}`;
        await this.redisClient.set(key, JSON.stringify(photo), 'EX', 3600); // Cache for 1 hour
    }

    async getPhotoMetadata(photoId: string): Promise<Photo | null> {
        const key = `photo:${photoId}`;
        const cachedData = await this.redisClient.get(key);
        if (cachedData) {
            return JSON.parse(cachedData) as Photo;
        }
        return null; // Return null if not found in cache
    }
}

export default PhotoProcessingService;