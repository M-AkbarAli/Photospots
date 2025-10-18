export interface User {
  id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface UserSubmission {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  name: string;
  tip?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
}
