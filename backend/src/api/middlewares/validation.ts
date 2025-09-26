import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const validateHotspotCreation = [
    body('title').isString().notEmpty().withMessage('Title is required'),
    body('description').isString().optional(),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be a valid number between -90 and 90'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be a valid number between -180 and 180'),
    body('tags').isArray().optional().withMessage('Tags must be an array of strings'),
    (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

export const validatePhotoUpload = [
    body('photo').isString().notEmpty().withMessage('Photo URL is required'),
    body('hotspotId').isString().notEmpty().withMessage('Hotspot ID is required'),
    (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

export const validateSearchQuery = [
    body('keywords').isString().optional(),
    body('category').isString().optional(),
    body('latitude').isFloat({ min: -90, max: 90 }).optional(),
    body('longitude').isFloat({ min: -180, max: 180 }).optional(),
    body('radius').isInt({ min: 1 }).optional(),
    (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];