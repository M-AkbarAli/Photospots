export interface Photo {
  id: string;
  user_id: string;
  spot_id?: string;
  original_key: string;
  variants: Record<string, string>;
  width?: number;
  height?: number;
  sha256?: string;
  visibility: 'public' | 'private';
  created_at: string;
}

export interface PhotoVariants {
  w256?: string;
  w512?: string;
  w1024?: string;
  avif?: string;
}

export interface CreatePhotoInput {
  user_id: string;
  spot_id?: string;
  original_key: string;
  width?: number;
  height?: number;
  visibility?: 'public' | 'private';
}
