-- Migration to add support for nameless photo spots (niche discoveries)
-- Photospots are spots without names that show just the photo as a marker

-- Update api_spots_nearby to include photospots alongside landmarks
DROP FUNCTION IF EXISTS api_spots_nearby(double precision, double precision, double precision, integer);

CREATE OR REPLACE FUNCTION api_spots_nearby(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION,
    limit_count INTEGER
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    score DOUBLE PRECISION,
    distance_m DOUBLE PRECISION,
    photo_url TEXT,
    categories TEXT[]
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        s.id,
        s.name,
        s.description,
        s.lat,
        s.lng,
        s.score,
        ST_Distance(s.geom::geography, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) AS distance_m,
        s.photo_url,
        s.categories
    FROM spots s
    WHERE s.geom IS NOT NULL
      AND ST_DWithin(s.geom::geography, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radius_meters)
      AND (
          'landmark' = ANY(s.categories) 
          OR 'photospot' = ANY(s.categories)
      )
      AND NOT ('hotspot' = ANY(s.categories))
      AND NOT ('area' = ANY(s.categories))
    ORDER BY distance_m ASC NULLS LAST, COALESCE(s.score, 0) DESC
    LIMIT limit_count;
$$;

COMMENT ON FUNCTION api_spots_nearby IS 'Returns nearby landmarks and photospots. Photospots are nameless niche discoveries shown as image markers.';

-- Update api_spots_search to also include photospots (they can be found by coordinates in description)
DROP FUNCTION IF EXISTS api_spots_search(text, double precision, double precision, integer);

CREATE OR REPLACE FUNCTION api_spots_search(
    query TEXT,
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    limit_count INTEGER
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    score DOUBLE PRECISION,
    distance_m DOUBLE PRECISION,
    photo_url TEXT,
    categories TEXT[]
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        s.id,
        s.name,
        s.description,
        s.lat,
        s.lng,
        s.score,
        CASE 
            WHEN center_lat IS NOT NULL AND center_lng IS NOT NULL 
            THEN ST_Distance(s.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography)
            ELSE NULL
        END AS distance_m,
        s.photo_url,
        s.categories
    FROM spots s
    WHERE s.name ILIKE '%' || query || '%'
      AND (
          'landmark' = ANY(s.categories)
      )
      AND NOT ('hotspot' = ANY(s.categories))
      AND NOT ('area' = ANY(s.categories))
    ORDER BY 
        CASE WHEN s.name ILIKE query THEN 0 ELSE 1 END,
        distance_m ASC NULLS LAST,
        COALESCE(s.score, 0) DESC
    LIMIT limit_count;
$$;

COMMENT ON FUNCTION api_spots_search IS 'Search for landmarks by name. Photospots are not searchable by name (they have no name).';
