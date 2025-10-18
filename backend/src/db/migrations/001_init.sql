-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create users mirror table (Supabase Auth manages auth.users)
-- This is optional - only if you need to store additional user fields
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create spots table
CREATE TABLE IF NOT EXISTS spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  geom GEOMETRY(Point, 4326) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('osm', 'ugc', 'opentrip', 'flickr', 'mix')),
  categories TEXT[],
  score NUMERIC DEFAULT 0,
  photo_url TEXT,
  description TEXT,
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create spot_stats table
CREATE TABLE IF NOT EXISTS spot_stats (
  spot_id UUID PRIMARY KEY REFERENCES spots(id) ON DELETE CASCADE,
  photo_density NUMERIC DEFAULT 0,
  recency_trend NUMERIC DEFAULT 0,
  opentrip_popularity NUMERIC DEFAULT 0,
  flickr_photo_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  spot_id UUID REFERENCES spots(id) ON DELETE SET NULL,
  original_key TEXT NOT NULL,
  variants JSONB DEFAULT '{}',
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create favorites table
CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  spot_id UUID REFERENCES spots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, spot_id)
);

-- Create user_submissions table
CREATE TABLE IF NOT EXISTS user_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  name TEXT NOT NULL,
  tip TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id)
);

-- Create indexes for spots
CREATE INDEX IF NOT EXISTS idx_spots_geom ON spots USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_spots_score ON spots (score DESC);
CREATE INDEX IF NOT EXISTS idx_spots_name ON spots (name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_spots_created_at ON spots (created_at DESC);

-- Create indexes for photos
CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos (user_id);
CREATE INDEX IF NOT EXISTS idx_photos_spot_id ON spots (id);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos (created_at DESC);

-- Create indexes for favorites
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_spot_id ON favorites (spot_id);

-- Create indexes for user_submissions
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON user_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON user_submissions (status);

-- Create RPC function for nearby spots
CREATE OR REPLACE FUNCTION api_spots_nearby(
  search_lat DOUBLE PRECISION,
  search_lng DOUBLE PRECISION,
  radius_m INTEGER DEFAULT 5000,
  result_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  source TEXT,
  categories TEXT[],
  score NUMERIC,
  photo_url TEXT,
  description TEXT,
  distance_m DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.lat,
    s.lng,
    s.source,
    s.categories,
    s.score,
    s.photo_url,
    s.description,
    ST_Distance(s.geom::geography, ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography) AS distance_m
  FROM spots s
  WHERE ST_DWithin(
    s.geom::geography,
    ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography,
    radius_m
  )
  ORDER BY s.score DESC, distance_m ASC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create RPC function for search with geo bias
CREATE OR REPLACE FUNCTION api_spots_search(
  search_query TEXT,
  search_lat DOUBLE PRECISION DEFAULT NULL,
  search_lng DOUBLE PRECISION DEFAULT NULL,
  result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  source TEXT,
  categories TEXT[],
  score NUMERIC,
  photo_url TEXT,
  description TEXT,
  distance_m DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.lat,
    s.lng,
    s.source,
    s.categories,
    s.score,
    s.photo_url,
    s.description,
    CASE 
      WHEN search_lat IS NOT NULL AND search_lng IS NOT NULL THEN
        ST_Distance(s.geom::geography, ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography)
      ELSE NULL
    END AS distance_m
  FROM spots s
  WHERE 
    s.name ILIKE '%' || search_query || '%'
    OR s.description ILIKE '%' || search_query || '%'
    OR search_query = ANY(s.categories)
  ORDER BY 
    s.score DESC,
    CASE 
      WHEN search_lat IS NOT NULL AND search_lng IS NOT NULL THEN distance_m
      ELSE 999999999
    END ASC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable Row Level Security
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for photos
CREATE POLICY "Users can view public photos or their own"
  ON photos FOR SELECT
  USING (visibility = 'public' OR auth.uid() = user_id);

CREATE POLICY "Users can insert their own photos"
  ON photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own photos"
  ON photos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own photos"
  ON photos FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for favorites
CREATE POLICY "Users can view their own favorites"
  ON favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites"
  ON favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites"
  ON favorites FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for user_submissions
CREATE POLICY "Users can view their own submissions"
  ON user_submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own submissions"
  ON user_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending submissions"
  ON user_submissions FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');
