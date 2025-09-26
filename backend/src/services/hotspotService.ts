import { supabase } from '../config/supabase';
import { RedisClient } from 'redis';
import { Hotspot } from '../types/hotspot';
import { calculateScore } from './scoringService';
import { clusterHotspots } from '../utils/clustering';

const redisClient = new RedisClient({ host: 'localhost', port: 6379 });

export const createHotspot = async (hotspotData: Hotspot) => {
    const { data, error } = await supabase
        .from('hotspots')
        .insert([hotspotData]);

    if (error) {
        throw new Error(`Error creating hotspot: ${error.message}`);
    }

    return data;
};

export const getHotspotById = async (id: string) => {
    const { data, error } = await supabase
        .from('hotspots')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        throw new Error(`Error fetching hotspot: ${error.message}`);
    }

    return data;
};

export const updateHotspot = async (id: string, hotspotData: Partial<Hotspot>) => {
    const { data, error } = await supabase
        .from('hotspots')
        .update(hotspotData)
        .eq('id', id);

    if (error) {
        throw new Error(`Error updating hotspot: ${error.message}`);
    }

    return data;
};

export const deleteHotspot = async (id: string) => {
    const { data, error } = await supabase
        .from('hotspots')
        .delete()
        .eq('id', id);

    if (error) {
        throw new Error(`Error deleting hotspot: ${error.message}`);
    }

    return data;
};

export const scoreHotspot = async (id: string) => {
    const hotspot = await getHotspotById(id);
    const score = calculateScore(hotspot);
    
    await updateHotspot(id, { score });
    return score;
};

export const clusterHotspotsService = async () => {
    const { data: hotspots } = await supabase
        .from('hotspots')
        .select('*');

    const clusteredHotspots = clusterHotspots(hotspots);
    // Store clustered hotspots in Redis or update the database as needed
    redisClient.set('clusteredHotspots', JSON.stringify(clusteredHotspots));
    
    return clusteredHotspots;
};