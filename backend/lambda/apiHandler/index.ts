import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { getHotspots, getPhotos, searchHotspots } from '../../src/api/controllers/hotspotController';
import { authenticateUser } from '../../src/api/controllers/authController';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const redis = new Redis(process.env.REDIS_URL || '');

export const handler = async (event: APIGatewayEvent, context: Context, callback: Callback) => {
    try {
        const { httpMethod, path } = event;

        switch (httpMethod) {
            case 'GET':
                if (path.startsWith('/hotspots')) {
                    const hotspots = await getHotspots(event);
                    callback(null, {
                        statusCode: 200,
                        body: JSON.stringify(hotspots),
                    });
                } else if (path.startsWith('/photos')) {
                    const photos = await getPhotos(event);
                    callback(null, {
                        statusCode: 200,
                        body: JSON.stringify(photos),
                    });
                } else if (path.startsWith('/search')) {
                    const results = await searchHotspots(event);
                    callback(null, {
                        statusCode: 200,
                        body: JSON.stringify(results),
                    });
                } else {
                    callback(null, {
                        statusCode: 404,
                        body: JSON.stringify({ message: 'Not Found' }),
                    });
                }
                break;

            case 'POST':
                if (path.startsWith('/auth')) {
                    const user = await authenticateUser(event);
                    callback(null, {
                        statusCode: 200,
                        body: JSON.stringify(user),
                    });
                } else {
                    callback(null, {
                        statusCode: 404,
                        body: JSON.stringify({ message: 'Not Found' }),
                    });
                }
                break;

            default:
                callback(null, {
                    statusCode: 405,
                    body: JSON.stringify({ message: 'Method Not Allowed' }),
                });
                break;
        }
    } catch (error) {
        console.error(error);
        callback(null, {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        });
    }
};