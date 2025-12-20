-- Add photo-level geo columns and geometry
ALTER TABLE photos
    ADD COLUMN IF NOT EXISTS lat double precision,
    ADD COLUMN IF NOT EXISTS lng double precision,
    ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

-- Indexes for photo lookup and spatial queries
CREATE INDEX IF NOT EXISTS photos_geom_gix ON photos USING GIST (geom);
CREATE INDEX IF NOT EXISTS photos_spot_id_idx ON photos (spot_id);

-- Backfill geo columns from variants JSON when missing
UPDATE photos
SET lat = (variants->>'latitude')::double precision,
    lng = (variants->>'longitude')::double precision,
    geom = ST_SetSRID(ST_MakePoint((variants->>'longitude')::double precision, (variants->>'latitude')::double precision), 4326)
WHERE lat IS NULL
  AND variants ? 'latitude'
  AND variants ? 'longitude';

-- Remove orphan photos prior to enforcing FK
DELETE FROM photos p
WHERE NOT EXISTS (SELECT 1 FROM spots s WHERE s.id = p.spot_id);

-- Ensure FK from photos to spots exists (with cascade)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_class f ON c.confrelid = f.oid
        WHERE t.relname = 'photos'
          AND f.relname = 'spots'
          AND c.contype = 'f'
    ) THEN
        ALTER TABLE photos
            ADD CONSTRAINT photos_spot_fk FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE;
    END IF;
END$$;

-- Add stable source identifier and parent relationship to spots
ALTER TABLE spots
    ADD COLUMN IF NOT EXISTS source_id text,
    ADD COLUMN IF NOT EXISTS parent_spot_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spots_parent_fk') THEN
        ALTER TABLE spots
            ADD CONSTRAINT spots_parent_fk FOREIGN KEY (parent_spot_id) REFERENCES spots(id) ON DELETE CASCADE;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS spots_parent_idx ON spots(parent_spot_id);

-- Enforce uniqueness on (source, source_id)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spots_source_source_id_key') THEN
        ALTER TABLE spots
            ADD CONSTRAINT spots_source_source_id_key UNIQUE (source, source_id);
    END IF;
END$$;


WITH flickr_candidates AS (
    SELECT
        id,
        COALESCE(NULLIF(trim(both '-' FROM lower(regexp_replace(name, '[^a-z0-9]+', '-', 'g'))), ''), 'id-' || id::text) AS base_slug
    FROM spots
    WHERE source = 'flickr'
      AND source_id IS NULL
),
numbered_slug AS (
    SELECT id, base_slug, ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS seq
    FROM flickr_candidates
)
UPDATE spots
SET source_id = 'place:' || numbered_slug.base_slug ||
    CASE WHEN numbered_slug.seq > 1 THEN '-' || numbered_slug.seq::text ELSE '' END
FROM numbered_slug
WHERE spots.id = numbered_slug.id;
