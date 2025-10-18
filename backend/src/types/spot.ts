export interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  source: 'osm' | 'ugc' | 'opentrip' | 'flickr' | 'mix';
  categories?: string[];
  score: number;
  photo_url?: string;
  description?: string;
  last_enriched_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SpotStats {
  spot_id: string;
  photo_density: number;
  recency_trend: number;
  opentrip_popularity: number;
  flickr_photo_count: number;
  updated_at: string;
}

export interface SpotWithDistance extends Spot {
  distance_m?: number;
}

export interface CreateSpotInput {
  name: string;
  lat: number;
  lng: number;
  source: Spot['source'];
  categories?: string[];
  description?: string;
}
