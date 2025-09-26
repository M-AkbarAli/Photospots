export interface Hotspot {
    id: string;
    title: string;
    description?: string;
    latitude: number;
    longitude: number;
    category: string[];
    createdAt: Date;
    updatedAt: Date;
    photos: string[]; // Array of photo IDs associated with the hotspot
    score: number; // Calculated score based on various metrics
}