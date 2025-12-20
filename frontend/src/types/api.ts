export interface ApiResponse<T> {
  success: boolean;
  data: T;
  count?: number;
}

export interface Spot {
  id: string;
  name: string;
  description: string | null;
  categories: string[];
  latitude: number;
  longitude: number;
  score: number;
  photoUrl?: string;
  distanceMeters?: number;
}

export interface PhotoVariant {
  latitude: number;
  longitude: number;
  url_l: string;
  url_o?: string;
  width: number;
  height: number;
}

export interface Photo {
  id: string;
  spotId: string;
  variants: PhotoVariant;
  createdAt: string;
}
