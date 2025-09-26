import { Hotspot } from '../types/hotspot';
import { Photo } from '../types/photo';
import { getHotspotData } from '../services/hotspotService';

const calculateScore = (hotspot: Hotspot): number => {
    const numPhotos = hotspot.photos.length;
    const totalFaves = hotspot.photos.reduce((sum, photo) => sum + photo.favorites, 0);
    const totalViews = hotspot.photos.reduce((sum, photo) => sum + photo.views, 0);
    const recencyBonus = hotspot.photos.filter(photo => isRecent(photo)).length;
    const duplicatePenalty = calculateDuplicatePenalty(hotspot.photos);

    const score = (Math.log(1 + numPhotos) * 1) +
                  (Math.log(1 + totalFaves) * 2) +
                  (Math.log(1 + totalViews) * 3) +
                  (recencyBonus * 5) -
                  (duplicatePenalty * 2);

    return score;
};

const isRecent = (photo: Photo): boolean => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return new Date(photo.uploadDate) >= oneYearAgo;
};

const calculateDuplicatePenalty = (photos: Photo[]): number => {
    const userPhotoCounts = photos.reduce((acc, photo) => {
        acc[photo.ownerId] = (acc[photo.ownerId] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return Object.values(userPhotoCounts).reduce((penalty, count) => {
        return penalty + (count > 1 ? count - 1 : 0);
    }, 0);
};

export const updateHotspotScores = async () => {
    const hotspots = await getHotspotData();
    hotspots.forEach(hotspot => {
        const score = calculateScore(hotspot);
        // Update the hotspot score in the database (implementation not shown)
    });
};