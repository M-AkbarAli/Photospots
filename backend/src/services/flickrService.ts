import axios from 'axios';
import { FlickrPhoto } from '../types/photo';
import { supabase } from '../config/supabase';

const FLICKR_API_KEY = process.env.FLICKR_API_KEY;
const FLICKR_API_URL = 'https://api.flickr.com/services/rest/';

export const fetchGeotaggedPhotos = async (bbox: string, radius: number): Promise<FlickrPhoto[]> => {
    try {
        const response = await axios.get(FLICKR_API_URL, {
            params: {
                method: 'flickr.photos.search',
                api_key: FLICKR_API_KEY,
                bbox,
                radius,
                has_geo: 1,
                extras: 'geo,tags,date_upload,date_taken,views,faves,owner_name',
                format: 'json',
                nojsoncallback: 1,
            },
        });

        return response.data.photos.photo;
    } catch (error) {
        console.error('Error fetching geotagged photos from Flickr:', error);
        throw new Error('Failed to fetch photos from Flickr');
    }
};

export const savePhotosToDatabase = async (photos: FlickrPhoto[]) => {
    const { data, error } = await supabase
        .from('photos')
        .insert(photos.map(photo => ({
            id: photo.id,
            title: photo.title,
            description: photo.description,
            tags: photo.tags,
            latitude: photo.latitude,
            longitude: photo.longitude,
            upload_date: photo.date_upload,
            taken_date: photo.date_taken,
            views: photo.views,
            favorites: photo.faves,
            owner_name: photo.owner_name,
        })));

    if (error) {
        console.error('Error saving photos to database:', error);
        throw new Error('Failed to save photos to database');
    }

    return data;
};