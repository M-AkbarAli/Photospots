# API Testing Guide

## New Endpoints Implemented ✅

### 1. Get Hotspots for a Landmark
**Endpoint:** `GET /v1/spots/:landmarkId/hotspots`

**Purpose:** Fetch all photography vantage points around a specific landmark.

**Example:**
```bash
# First, get a landmark ID from your nearby spots
curl "http://localhost:3000/v1/spots/nearby?lat=43.6629&lng=-79.3957&radius=5000" | jq

# Copy a landmark ID from the response, then:
LANDMARK_ID="4570849b-9827-45b5-bbf5-9aec135c8b91"
curl "http://localhost:3000/v1/spots/c23e7bcc-f337-4928-b458-e8f07ff233f4/hotspots" | jq
```

**Response:**
```json
{
  "success": true,
  "landmark": {
    "id": "landmark-uuid",
    "name": "Royal Ontario Museum"
  },
  "count": 3,
  "hotspots": [
    {
      "id": "hotspot-uuid-1",
      "name": "Photography vantage point",
      "lat": 43.6678,
      "lng": -79.3947,
      "distance": 150,
      "categories": ["hotspot"],
      "score": 0.85,
      "photo_url": "https://..."
    }
  ]
}
```

---

### 2. Get Photos for a Spot
**Endpoint:** `GET /v1/spots/:spotId/photos`

**Purpose:** Fetch example photos taken from a specific hotspot or landmark.

**Example:**
```bash
# Get a hotspot ID from the previous call, then:
HOTSPOT_ID="your-hotspot-id-here"

# Fetch photos for that hotspot
curl "http://localhost:3000/v1/spots/$HOTSPOT_ID/photos" | jq
```

**Response:**
```json
{
  "success": true,
  "count": 12,
  "photos": [
    {
      "id": "photo-uuid",
      "spot_id": "hotspot-uuid",
      "user_id": null,
      "original_key": "flickr:123456789",
      "variants": {
        "small": "https://farm5.staticflickr.com/.../photo_s.jpg",
        "medium": "https://farm5.staticflickr.com/.../photo_m.jpg",
        "large": "https://farm5.staticflickr.com/.../photo_b.jpg",
        "original": "https://farm5.staticflickr.com/.../photo_o.jpg"
      },
      "visibility": "public",
      "created_at": "2024-11-14T..."
    }
  ]
}
```

---

## Complete User Flow Test

```bash
#!/bin/bash

# 1. Get user's location (example: Toronto downtown)
LAT=43.6629
LNG=-79.3957

echo "1️⃣ Fetching nearby landmarks..."
LANDMARKS=$(curl -s "http://localhost:3000/v1/spots/nearby?lat=$LAT&lng=$LNG&radius=5000")
echo $LANDMARKS | jq '.data[0:3]'

# 2. Extract first landmark ID
LANDMARK_ID=$(echo $LANDMARKS | jq -r '.data[0].id')
LANDMARK_NAME=$(echo $LANDMARKS | jq -r '.data[0].name')

echo "\n2️⃣ Selected landmark: $LANDMARK_NAME ($LANDMARK_ID)"

# 3. Get hotspots for this landmark
echo "\n3️⃣ Fetching hotspots for $LANDMARK_NAME..."
HOTSPOTS=$(curl -s "http://localhost:3000/v1/spots/$LANDMARK_ID/hotspots")
echo $HOTSPOTS | jq

# 4. Extract first hotspot ID
HOTSPOT_ID=$(echo $HOTSPOTS | jq -r '.hotspots[0].id')

echo "\n4️⃣ Selected hotspot: $HOTSPOT_ID"

# 5. Get example photos from this hotspot
echo "\n5️⃣ Fetching example photos..."
PHOTOS=$(curl -s "http://localhost:3000/v1/spots/$HOTSPOT_ID/photos")
echo $PHOTOS | jq '.photos[0:3]'

echo "\n✅ Flow complete! User can now:"
echo "   - See the landmark on the map"
echo "   - View hotspots around it"
echo "   - Browse example photos"
echo "   - Navigate to the hotspot"
```

---

## Testing with Your Database

### Step 1: Query a Landmark Directly
```bash
# Use psql or Supabase dashboard to get a landmark ID
# SELECT id, name FROM spots WHERE categories @> ARRAY['landmark'] LIMIT 1;

# Then test with that specific ID
curl "http://localhost:3000/v1/spots/YOUR_LANDMARK_ID/hotspots" | jq
```

### Step 2: Verify Hotspots Exist
```sql
-- In Supabase SQL Editor
SELECT 
  id,
  name,
  lat,
  lng,
  categories,
  parent_spot_id
FROM spots
WHERE categories @> ARRAY['hotspot']
LIMIT 10;
```

### Step 3: Verify Photos Exist
```sql
-- In Supabase SQL Editor
SELECT 
  p.id,
  p.spot_id,
  s.name as spot_name,
  p.visibility,
  p.created_at
FROM photos p
JOIN spots s ON s.id = p.spot_id
WHERE p.visibility = 'public'
LIMIT 10;
```

---

## Expected Behavior

### ✅ Success Cases:

1. **Valid landmark with hotspots:**
   - Returns 200
   - `count` > 0
   - `hotspots` array contains nearby vantage points

2. **Valid hotspot with photos:**
   - Returns 200
   - `count` > 0
   - `photos` array contains Flickr-seeded images

3. **Valid landmark with no hotspots:**
   - Returns 200
   - `count` = 0
   - `hotspots` = []

4. **Valid hotspot with no photos:**
   - Returns 200
   - `count` = 0
   - `photos` = []

### ❌ Error Cases:

1. **Invalid landmark ID:**
   - Returns 404
   - Error: "Landmark not found"

2. **Malformed UUID:**
   - Returns 500 or 404 (database error)

---

## Integration with Frontend

### React Native / Expo Example:

```typescript
// 1. User opens app - get nearby landmarks
const fetchNearbyLandmarks = async (lat: number, lng: number) => {
  const response = await fetch(
    `${API_URL}/v1/spots/nearby?lat=${lat}&lng=${lng}&radius=5000`
  );
  const data = await response.json();
  return data.data; // Array of landmarks
};

// 2. User taps landmark - get hotspots
const fetchHotspots = async (landmarkId: string) => {
  const response = await fetch(
    `${API_URL}/v1/spots/${landmarkId}/hotspots`
  );
  const data = await response.json();
  return data.hotspots; // Array of hotspots
};

// 3. User taps hotspot - get photos
const fetchPhotos = async (hotspotId: string) => {
  const response = await fetch(
    `${API_URL}/v1/spots/${hotspotId}/photos`
  );
  const data = await response.json();
  return data.photos; // Array of photos
};

// 4. User navigates to hotspot
const navigateToHotspot = (hotspot: Hotspot) => {
  const url = Platform.select({
    ios: `maps://app?daddr=${hotspot.lat},${hotspot.lng}`,
    android: `google.navigation:q=${hotspot.lat},${hotspot.lng}`,
  });
  Linking.openURL(url);
};
```

---

## Notes

- ✅ **Seed endpoint removed** - Seeding now only via CLI (`npx tsx src/scripts/seedPhotosByAkbar.ts`)
- ✅ **Two new endpoints** - Hotspots and photos retrieval
- ✅ **No auth required** - These are public read endpoints
- ✅ **PostGIS integration** - Uses nearby search for hotspot discovery
- ⚠️ **Limitation** - Hotspots identified by `categories` array (not parent_spot_id yet)

---

## Next Steps

1. Test these endpoints with real data from your database
2. Integrate into frontend
3. Consider adding `parent_spot_id` column for better data relationships (see NEXT_STEPS.md Phase 3)
4. Add pagination for photos endpoint if needed (`?limit=10&offset=0`)
