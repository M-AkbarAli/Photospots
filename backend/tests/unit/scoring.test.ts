import { calculateScore } from '../../src/services/scoringService';

describe('Scoring Service', () => {
    test('should calculate score based on number of photos', () => {
        const numPhotos = 10;
        const totalFaves = 5;
        const totalViews = 100;
        const recencyBonus = 2;
        const duplicatePenalty = 1;

        const score = calculateScore(numPhotos, totalFaves, totalViews, recencyBonus, duplicatePenalty);
        
        expect(score).toBeGreaterThan(0);
    });

    test('should apply recency bonus correctly', () => {
        const numPhotos = 5;
        const totalFaves = 10;
        const totalViews = 50;
        const recencyBonus = 5;
        const duplicatePenalty = 0;

        const score = calculateScore(numPhotos, totalFaves, totalViews, recencyBonus, duplicatePenalty);
        
        expect(score).toBeGreaterThan(0);
        expect(score).toBeGreaterThan(calculateScore(numPhotos, totalFaves, totalViews, 0, duplicatePenalty));
    });

    test('should apply duplicate penalty correctly', () => {
        const numPhotos = 8;
        const totalFaves = 20;
        const totalViews = 200;
        const recencyBonus = 3;
        const duplicatePenalty = 5;

        const scoreWithPenalty = calculateScore(numPhotos, totalFaves, totalViews, recencyBonus, duplicatePenalty);
        const scoreWithoutPenalty = calculateScore(numPhotos, totalFaves, totalViews, recencyBonus, 0);

        expect(scoreWithPenalty).toBeLessThan(scoreWithoutPenalty);
    });
});