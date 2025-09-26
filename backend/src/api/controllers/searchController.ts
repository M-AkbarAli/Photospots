import { Request, Response } from 'express';
import { geoService } from '../../services/geoService';
import { hotspotService } from '../../services/hotspotService';

export const searchHotspots = async (req: Request, res: Response) => {
    const { lat, lon, radius, keywords, category } = req.query;

    try {
        const hotspots = await hotspotService.searchHotspots({
            lat: Number(lat),
            lon: Number(lon),
            radius: Number(radius),
            keywords: keywords ? String(keywords) : undefined,
            category: category ? String(category) : undefined,
        });

        return res.status(200).json(hotspots);
    } catch (error) {
        return res.status(500).json({ message: 'Error searching hotspots', error });
    }
};

export const searchPhotos = async (req: Request, res: Response) => {
    const { keywords, category } = req.query;

    try {
        const photos = await geoService.searchPhotos({
            keywords: keywords ? String(keywords) : undefined,
            category: category ? String(category) : undefined,
        });

        return res.status(200).json(photos);
    } catch (error) {
        return res.status(500).json({ message: 'Error searching photos', error });
    }
};