import { Request, Response } from 'express';
import { PhotoService } from '../../services/photoProcessingService';
import { validationResult } from 'express-validator';

const photoService = new PhotoService();

// Upload a photo
export const uploadPhoto = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const photoData = req.body; // Assuming photo data is sent in the request body
        const result = await photoService.uploadPhoto(photoData);
        return res.status(201).json(result);
    } catch (error) {
        return res.status(500).json({ message: 'Error uploading photo', error });
    }
};

// Retrieve a photo by ID
export const getPhotoById = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const photo = await photoService.getPhotoById(id);
        if (!photo) {
            return res.status(404).json({ message: 'Photo not found' });
        }
        return res.status(200).json(photo);
    } catch (error) {
        return res.status(500).json({ message: 'Error retrieving photo', error });
    }
};

// Delete a photo by ID
export const deletePhoto = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const result = await photoService.deletePhoto(id);
        if (!result) {
            return res.status(404).json({ message: 'Photo not found' });
        }
        return res.status(204).send();
    } catch (error) {
        return res.status(500).json({ message: 'Error deleting photo', error });
    }
};

// List all photos
export const listPhotos = async (req: Request, res: Response) => {
    try {
        const photos = await photoService.listPhotos();
        return res.status(200).json(photos);
    } catch (error) {
        return res.status(500).json({ message: 'Error retrieving photos', error });
    }
};