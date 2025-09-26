import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { clusterHotspots } from '../../src/services/hotspotService';
import { getGeotaggedPhotos } from '../../src/services/flickrService';

export const handler = async (event: APIGatewayEvent, context: Context, callback: Callback) => {
    try {
        const { lat, lon, radius } = JSON.parse(event.body || '{}');

        if (!lat || !lon || !radius) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Missing required parameters: lat, lon, radius' }),
            };
        }

        const photos = await getGeotaggedPhotos(lat, lon, radius);
        const hotspots = await clusterHotspots(photos);

        return {
            statusCode: 200,
            body: JSON.stringify(hotspots),
        };
    } catch (error) {
        console.error('Error clustering hotspots:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};