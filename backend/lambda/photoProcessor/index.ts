import { S3 } from 'aws-sdk';
import { Handler } from 'aws-lambda';
import { processPhoto } from '../../src/services/photoProcessingService';
import { uploadToS3 } from '../../src/config/aws';

const s3 = new S3();

export const handler: Handler = async (event) => {
    try {
        const { photoData } = JSON.parse(event.body);

        // Process the photo (e.g., resizing, filtering)
        const processedPhoto = await processPhoto(photoData);

        // Upload the processed photo to S3
        const uploadResult = await uploadToS3(processedPhoto);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Photo processed and uploaded successfully',
                uploadResult,
            }),
        };
    } catch (error) {
        console.error('Error processing photo:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to process photo',
                error: error.message,
            }),
        };
    }
};