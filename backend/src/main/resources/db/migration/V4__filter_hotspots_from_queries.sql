-- Migration to ensure only landmarks are returned from nearby/search queries
-- Hotspots are deprecated and photos are now attached directly to landmarks

-- Update api_spots_nearby to filter out hotspots
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
      AND ('landmark' = ANY(s.categories) OR 'area' = ANY(s.categories))
      AND NOT ('hotspot' = ANY(s.categories))
    ORDER BY distance_m ASC NULLS LAST, COALESCE(s.score, 0) DESC
    LIMIT limit_count;
$$;

-- Update api_spots_search to filter out hotspots
DROP FUNCTION IF EXISTS api_spots_search(text, double precision, double precision, integer);

CREATE OR REPLACE FUNCTION api_spots_search(
    query TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
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
    WITH query_vector AS (
        SELECT plainto_tsquery('english', query) AS q
    ),
    ranked AS (
        SELECT
            s.id,
            s.name,
            s.description,
            s.lat,
            s.lng,
            s.score,
            s.photo_url,
            s.categories,
            ts_rank_cd(
                to_tsvector('english', coalesce(s.name, '') || ' ' || coalesce(s.description, '') || ' ' || coalesce(array_to_string(s.categories, ' '), '')),
                q.q
            ) AS rank,
            CASE
                WHEN lat IS NOT NULL AND lng IS NOT NULL AND s.geom IS NOT NULL THEN
                    ST_Distance(s.geom::geography, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography)
                ELSE NULL
            END AS distance_m
        FROM spots s, query_vector q
        WHERE to_tsvector('english', coalesce(s.name, '') || ' ' || coalesce(s.description, '') || ' ' || coalesce(array_to_string(s.categories, ' '), '')) @@ q.q
          AND ('landmark' = ANY(s.categories) OR 'area' = ANY(s.categories))
          AND NOT ('hotspot' = ANY(s.categories))
    )
    SELECT id, name, description, lat, lng, score, distance_m, photo_url, categories
    FROM ranked
    ORDER BY rank DESC, COALESCE(distance_m, 0) ASC, COALESCE(score, 0) DESC
    LIMIT limit_count;
$$;

-- Add comment explaining the architectural change
COMMENT ON FUNCTION api_spots_nearby IS 'Returns nearby landmarks and areas, excluding deprecated hotspot spots. Photos are now attached directly to landmarks.';
COMMENT ON FUNCTION api_spots_search IS 'Searches for landmarks and areas, excluding deprecated hotspot spots. Photos are now attached directly to landmarks.';
