export interface Photo {
    id: string;
    title: string;
    description: string;
    tags: string[];
    latitude: number;
    longitude: number;
    uploadDate: Date;
    takenDate: Date;
    views: number;
    favourites: number;
    ownerName: string;
}