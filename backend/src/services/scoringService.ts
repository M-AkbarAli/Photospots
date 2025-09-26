import { Hotspot } from '../types/hotspot';
import { Photo } from '../types/photo';

interface ScoringWeights {
    w1: number;
    w2: number;
    w3: number;
    w4: number;
    w5: number;
}

const defaultWeights: ScoringWeights = {
    w1: 1,
    w2: 1,
    w3: 1,
    w4: 1,
    w5: 1,
};

export const calculateScore = (hotspot: Hotspot, weights: ScoringWeights = defaultWeights): number => {
    const numPhotos = hotspot.photos.length;
    const totalFaves = hotspot.photos.reduce((sum, photo: Photo) => sum + photo.favorites, 0);
    const totalViews = hotspot.photos.reduce((sum, photo: Photo) => sum + photo.views, 0);
    const recencyBonus = hotspot.photos.filter(photo => isRecent(photo)).length;
    const duplicatePenalty = calculateDuplicatePenalty(hotspot.photos);

    return (
        weights.w1 * Math.log(1 + numPhotos) +
        weights.w2 * Math.log(1 + totalFaves) +
        weights.w3 * Math.log(1 + totalViews) +
        weights.w4 * recencyBonus -
        weights.w5 * duplicatePenalty
    );
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