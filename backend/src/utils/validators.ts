import { body, validationResult } from 'express-validator';

export const validateHotspotCreation = [
    body('title').isString().notEmpty().withMessage('Title is required'),
    body('description').isString().optional(),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be a valid coordinate'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be a valid coordinate'),
    body('tags').isArray().optional().withMessage('Tags must be an array'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

export const validatePhotoUpload = [
    body('photoUrl').isURL().withMessage('Photo URL must be a valid URL'),
    body('hotspotId').isString().notEmpty().withMessage('Hotspot ID is required'),
    (req, res, next) => {
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
    body('radius').isInt({ min: 0 }).optional(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];