import { Request, Response } from 'express';
import { HotspotService } from '../../services/hotspotService';
import { validationResult } from 'express-validator';

const hotspotService = new HotspotService();

export const createHotspot = async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const hotspotData = req.body;
        const newHotspot = await hotspotService.createHotspot(hotspotData);
        return res.status(201).json(newHotspot);
    } catch (error) {
        return res.status(500).json({ message: 'Error creating hotspot', error });
    }
};

export const getHotspot = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const hotspot = await hotspotService.getHotspotById(id);
        if (!hotspot) {
            return res.status(404).json({ message: 'Hotspot not found' });
        }
        return res.status(200).json(hotspot);
    } catch (error) {
        return res.status(500).json({ message: 'Error retrieving hotspot', error });
    }
};

export const updateHotspot = async (req: Request, res: Response) => {
    const { id } = req.params;
    const hotspotData = req.body;

    try {
        const updatedHotspot = await hotspotService.updateHotspot(id, hotspotData);
        if (!updatedHotspot) {
            return res.status(404).json({ message: 'Hotspot not found' });
        }
        return res.status(200).json(updatedHotspot);
    } catch (error) {
        return res.status(500).json({ message: 'Error updating hotspot', error });
    }
};

export const deleteHotspot = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const deleted = await hotspotService.deleteHotspot(id);
        if (!deleted) {
            return res.status(404).json({ message: 'Hotspot not found' });
        }
        return res.status(204).send();
    } catch (error) {
        return res.status(500).json({ message: 'Error deleting hotspot', error });
    }
};

export const listHotspots = async (req: Request, res: Response) => {
    try {
        const hotspots = await hotspotService.listHotspots();
        return res.status(200).json(hotspots);
    } catch (error) {
        return res.status(500).json({ message: 'Error retrieving hotspots', error });
    }
};