import { Router } from 'express';
import {
  createHotspot,
  getHotspots,
  updateHotspot,
  deleteHotspot,
  getHotspotById,
} from '../controllers/hotspotController';
import { validateHotspot } from '../middlewares/validation';

const router = Router();

// Route to create a new hotspot
router.post('/', validateHotspot, createHotspot);

// Route to get all hotspots
router.get('/', getHotspots);

// Route to get a specific hotspot by ID
router.get('/:id', getHotspotById);

// Route to update a hotspot
router.put('/:id', validateHotspot, updateHotspot);

// Route to delete a hotspot
router.delete('/:id', deleteHotspot);

export default router;