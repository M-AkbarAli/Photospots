import { Router } from 'express';
import { uploadPhoto, getPhotos, getPhotoById, deletePhoto } from '../controllers/photoController';
import { authenticate } from '../middlewares/auth';
import { validatePhotoUpload } from '../middlewares/validation';

const router = Router();

// Route to upload a new photo
router.post('/', authenticate, validatePhotoUpload, uploadPhoto);

// Route to get all photos
router.get('/', getPhotos);

// Route to get a specific photo by ID
router.get('/:id', getPhotoById);

// Route to delete a photo by ID
router.delete('/:id', authenticate, deletePhoto);

export default router;