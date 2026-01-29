-- Allow NULL names for photospots (niche discoveries without names)
-- Landmarks will still have names, but photospots are identified by their photos only

ALTER TABLE spots ALTER COLUMN name DROP NOT NULL;

-- Add a check constraint to ensure landmarks always have names
-- but photospots can have NULL names
ALTER TABLE spots ADD CONSTRAINT spots_name_check 
CHECK (
    (name IS NOT NULL) OR 
    ('photospot' = ANY(categories))
);

COMMENT ON CONSTRAINT spots_name_check ON spots IS 
'Ensures landmarks have names but photospots can be nameless';
