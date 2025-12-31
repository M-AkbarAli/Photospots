-- Create RPC helpers that mimic the Supabase stored procedures used by the legacy frontend
-- These functions return the columns the backend expects and encapsulate PostGIS logic.

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
    ORDER BY distance_m ASC NULLS LAST, COALESCE(s.score, 0) DESC
    LIMIT limit_count;
$$;

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
    )
    SELECT id, name, description, lat, lng, score, distance_m, photo_url, categories
    FROM ranked
    ORDER BY rank DESC, COALESCE(distance_m, 0) ASC, COALESCE(score, 0) DESC
    LIMIT limit_count;
$$;
