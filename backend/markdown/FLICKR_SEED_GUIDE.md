# Flickr Photo Seeding Guide

## Overview

This guide explains how to create a seed script that finds the **best photography locations** for landmarks near a user. The app helps users discover where to stand to take great photos of places they want to photograph.

### The Problem This Solves

You want to photograph the ROM (Royal Ontario Museum). Instead of wandering around for 5 minutes looking for a good angle, the app:

1. Shows you nearby landmarks (ROM, CN Tower, etc.)
2. When you select ROM, shows you **hotspots** - proven photo locations
3. Each hotspot shows example photos taken from that spot
4. Navigate to that exact spot to take your own photo

### How It Works

```
User opens app → Sees "ROM" nearby → Clicks ROM → Sees 3 hotspots around it
  ↓
Hotspot 1: "Across Queen's Park" (50m north) - 25 photos of ROM facade
Hotspot 2: "Philosopher's Walk" (80m northeast) - 12 photos of ROM entrance  
Hotspot 3: "In the park" (100m east) - 18 photos of ROM with trees
  ↓
User picks Hotspot 1 → Sees example photos → Gets directions to that exact spot
```

## Architecture

```
User Location → Find Nearby Landmarks → For Each Landmark, Find Photography Hotspots → Display on Map
```

### Key Concepts

**Landmarks/Places**: Popular locations users want to photograph (ROM, CN Tower, parks, etc.)
- These are what users browse and select
- Stored in `spots` table as the main subject
- Has its own coordinates (the landmark's location)

**Hotspots**: The precise locations (±10 meters) where photographers stood to capture that landmark
- These are the **photography vantage points**
- Grouped by where photos were taken FROM, not OF
- Each hotspot has multiple example photos of the landmark
- Also stored in `spots` table but linked to parent landmark

**Photos**: Images from Flickr showing what the landmark looks like from each hotspot
- Reference to hotspot (the vantage point)
- Flickr photo URL
- Metadata (photographer, date, etc.)

## Implementation Steps

### Step 1: Set Up Flickr API

1. **Get Flickr API Credentials** (if you haven't already):
   - Go to https://www.flickr.com/services/apps/create/
   - Create a new app to get API key and secret
   - Add to your `.env`:
   ```env
   FLICKR_API_KEY=your_actual_api_key
   FLICKR_API_SECRET=your_actual_api_secret
   ```

2. **Install Flickr SDK** (optional, or use fetch):
   ```bash
   npm install flickr-sdk
   ```

   Or use direct HTTP requests with `node-fetch`:
   ```bash
   npm install node-fetch@2
   ```

### Step 2: Create the Seed Script

Create `backend/src/scripts/seedPhotosFromFlickr.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

interface FlickrPhoto {
  id: string;
  owner: string;
  secret: string;
  server: string;
  farm: number;
  title: string;
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface FlickrSearchResponse {
  photos: {
    photo: FlickrPhoto[];
    pages: number;
    total: number;
  };
  stat: string;
}

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

/**
 * Construct Flickr photo URL from photo object
 */
function getFlickrPhotoUrl(photo: FlickrPhoto, size: string = 'b'): string {
  // Size suffixes: s=small, m=medium, b=large, o=original
  return `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_${size}.jpg`;
}

/**
 * Search for popular places/landmarks near a location using Flickr API
 * These are the subjects users want to photograph (ROM, CN Tower, etc.)
 */
async function searchLandmarks(
  lat: number,
  lng: number,
  radiusKm: number = 5
): Promise<string[]> {
  const apiKey = config.externalApis.flickr.apiKey;
  
  // Use Flickr's places API to find popular photo locations
  const url = new URL('https://api.flickr.com/services/rest/');
  url.searchParams.append('method', 'flickr.places.placesForTags');
  url.searchParams.append('api_key', apiKey);
  url.searchParams.append('place_type_id', '22'); // Landmarks/points of interest
  url.searchParams.append('lat', lat.toString());
  url.searchParams.append('lon', lng.toString());
  url.searchParams.append('radius', radiusKm.toString());
  url.searchParams.append('radius_units', 'km');
  url.searchParams.append('format', 'json');
  url.searchParams.append('nojsoncallback', '1');

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Flickr API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.stat !== 'ok') {
    throw new Error('Flickr API returned error status');
  }

  // Extract place names/tags
  return data.places?.place?.map((p: any) => p.name) || [];
}

/**
 * Search for photos OF a specific landmark (tagged with landmark name)
 * These photos will have geo-coordinates showing WHERE they were taken FROM
 */
async function searchPhotosOfLandmark(
  landmarkName: string,
  landmarkLat: number,
  landmarkLng: number,
  radiusKm: number = 2
): Promise<FlickrPhoto[]> {
  const apiKey = config.externalApis.flickr.apiKey;
  
  // Search for photos tagged with the landmark name, with geo-coordinates
  const url = new URL('https://api.flickr.com/services/rest/');
  url.searchParams.append('method', 'flickr.photos.search');
  url.searchParams.append('api_key', apiKey);
  url.searchParams.append('tags', landmarkName);
  url.searchParams.append('lat', landmarkLat.toString());
  url.searchParams.append('lon', landmarkLng.toString());
  url.searchParams.append('radius', radiusKm.toString());
  url.searchParams.append('radius_units', 'km');
  url.searchParams.append('has_geo', '1'); // CRITICAL: Only photos with geo-tags (where photographer stood)
  url.searchParams.append('accuracy', '16'); // Street-level accuracy
  url.searchParams.append('extras', 'geo,url_b,tags'); // Include photographer's location + image URL
  url.searchParams.append('per_page', '200'); // Get more photos to find clusters
  url.searchParams.append('format', 'json');
  url.searchParams.append('nojsoncallback', '1');
  url.searchParams.append('sort', 'interestingness-desc');

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Flickr API error: ${response.statusText}`);
  }

  const data: FlickrSearchResponse = await response.json();
  
  if (data.stat !== 'ok') {
    throw new Error('Flickr API returned error status');
  }

  return data.photos.photo;
}

/**
 * Group photos by their precise location (within ~10 meters)
 * This creates "hotspots" - photography vantage points where multiple people stood
 * 
 * Key insight: photo.latitude/longitude = where PHOTOGRAPHER stood, not what they photographed
 */
function groupPhotosIntoHotspots(photos: FlickrPhoto[]): Map<string, FlickrPhoto[]> {
  const PRECISION = 4; // ~11 meters precision (4 decimal places)
  const hotspotMap = new Map<string, FlickrPhoto[]>();

  for (const photo of photos) {
    if (!photo.latitude || !photo.longitude) continue;

    // Round coordinates to create hotspot key (photographer's position)
    const hotspotKey = `${photo.latitude.toFixed(PRECISION)},${photo.longitude.toFixed(PRECISION)}`;
    
    if (!hotspotMap.has(hotspotKey)) {
      hotspotMap.set(hotspotKey, []);
    }
    hotspotMap.get(hotspotKey)!.push(photo);
  }

  // Filter: Keep only locations where 3+ people photographed the landmark
  // This indicates it's a proven good spot
  return new Map(
    Array.from(hotspotMap.entries()).filter(([_, photos]) => photos.length >= 3)
  );
}

/**
 * Insert or update a landmark (the place users want to photograph)
 */
async function upsertLandmark(
  lat: number,
  lng: number,
  name: string,
  photoUrl: string
): Promise<string> {
  // Check if landmark already exists
  const { data: existing } = await supabase
    .from('spots')
    .select('id')
    .eq('name', name)
    .eq('lat', lat)
    .eq('lng', lng)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new landmark
  const { data: landmark, error } = await supabase
    .from('spots')
    .insert({
      name,
      lat,
      lng,
      photo_url: photoUrl,
      source: 'flickr',
      score: 0.5,
      categories: ['landmark'], // Tag as a landmark/place
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating landmark:', error);
    throw error;
  }

  console.log(`Created landmark: ${name} (${landmark.id})`);
  return landmark.id;
}

/**
 * Insert or update a hotspot (a photography vantage point for a landmark)
 */
async function upsertHotspot(
  landmarkId: string,
  landmarkName: string,
  hotspotLat: number,
  hotspotLng: number,
  photoCount: number,
  coverPhotoUrl: string
): Promise<string> {
  // Generate hotspot name based on direction from landmark
  const hotspotName = `Photo spot for ${landmarkName}`;

  // Check if hotspot already exists at this location
  const { data: existing } = await supabase
    .from('spots')
    .select('id')
    .eq('lat', hotspotLat)
    .eq('lng', hotspotLng)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new hotspot
  // Note: You may want to add a parent_spot_id field to spots table to link hotspots to landmarks
  const { data: hotspot, error } = await supabase
    .from('spots')
    .insert({
      name: hotspotName,
      lat: hotspotLat,
      lng: hotspotLng,
      photo_url: coverPhotoUrl,
      source: 'flickr',
      score: Math.min(photoCount / 10, 1), // Score based on photo count
      categories: ['hotspot'], // Tag as a hotspot/vantage point
      description: `${photoCount} photos of ${landmarkName} taken from here`,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating hotspot:', error);
    throw error;
  }

  console.log(`Created hotspot at (${hotspotLat}, ${hotspotLng}) with ${photoCount} photos`);
  return hotspot.id;
}

/**
 * Insert photos for a hotspot (photos taken FROM this vantage point)
 */
async function insertPhotosForHotspot(hotspotId: string, photos: FlickrPhoto[]) {
  const photoRecords = photos.map(photo => ({
    spot_id: hotspotId, // Link photos to the hotspot (vantage point)
    user_id: null, // System-seeded photos don't have a user
    original_key: `flickr:${photo.id}`, // Store Flickr ID as external reference
    variants: {
      small: getFlickrPhotoUrl(photo, 's'),
      medium: getFlickrPhotoUrl(photo, 'm'),
      large: getFlickrPhotoUrl(photo, 'b'),
    },
    width: null, // Unknown from Flickr API
    height: null,
    sha256: null, // External photo, no hash needed
    visibility: 'public',
  }));

  // Check if photos already exist
  const existingKeys = photos.map(p => `flickr:${p.id}`);
  const { data: existing } = await supabase
    .from('photos')
    .select('original_key')
    .eq('spot_id', hotspotId)
    .in('original_key', existingKeys);

  const existingSet = new Set(existing?.map(p => p.original_key) || []);
  const newPhotos = photoRecords.filter(p => !existingSet.has(p.original_key));

  if (newPhotos.length === 0) {
    console.log(`All photos already exist for hotspot ${hotspotId}`);
    return;
  }

  const { error } = await supabase
    .from('photos')
    .insert(newPhotos);

  if (error) {
    console.error('Error inserting photos:', error);
    throw error;
  }

  console.log(`Inserted ${newPhotos.length} example photos for hotspot ${hotspotId}`);
}

/**
 * Main seeding function - call this from your API endpoint
 * 
 * This function:
 * 1. Finds popular landmarks near the user
 * 2. For each landmark, finds photos tagged with that landmark name
 * 3. Groups those photos by where they were taken FROM (photographer's position)
 * 4. Creates hotspots for the best vantage points
 */
export async function seedPhotosForLocation(
  userLat: number,
  userLng: number,
  radiusKm: number = 5
) {
  console.log(`Seeding hotspots for location: ${userLat}, ${userLng} (radius: ${radiusKm}km)`);

  try {
    // STEP 1: Find popular landmarks near user
    // For MVP, we'll use a simpler approach: search for all geo-tagged photos,
    // then use their tags to identify landmarks
    const url = new URL('https://api.flickr.com/services/rest/');
    url.searchParams.append('method', 'flickr.photos.search');
    url.searchParams.append('api_key', config.externalApis.flickr.apiKey);
    url.searchParams.append('lat', userLat.toString());
    url.searchParams.append('lon', userLng.toString());
    url.searchParams.append('radius', radiusKm.toString());
    url.searchParams.append('radius_units', 'km');
    url.searchParams.append('has_geo', '1');
    url.searchParams.append('accuracy', '16');
    url.searchParams.append('extras', 'geo,url_b,tags');
    url.searchParams.append('per_page', '500'); // Get many photos to analyze
    url.searchParams.append('format', 'json');
    url.searchParams.append('nojsoncallback', '1');
    url.searchParams.append('sort', 'interestingness-desc');

    const response = await fetch(url.toString());
    const data: FlickrSearchResponse = await response.json();
    
    if (data.stat !== 'ok' || !data.photos.photo.length) {
      return { success: true, message: 'No photos found in this area', landmarksCreated: 0 };
    }

    console.log(`Found ${data.photos.photo.length} photos from Flickr`);

    // STEP 2: Identify landmarks by analyzing photo tags
    // Find tags that appear frequently (e.g., "ROM", "CN Tower", "High Park")
    const tagCounts = new Map<string, FlickrPhoto[]>();
    
    for (const photo of data.photos.photo) {
      if (!photo.tags) continue;
      
      // Split tags and filter out generic ones
      const tags = photo.tags.split(' ').filter(tag => 
        tag.length > 3 && 
        !['photo', 'image', 'camera', 'canon', 'nikon'].includes(tag.toLowerCase())
      );
      
      for (const tag of tags) {
        if (!tagCounts.has(tag)) {
          tagCounts.set(tag, []);
        }
        tagCounts.get(tag)!.push(photo);
      }
    }

    // Get top landmarks (tags with 10+ photos)
    const landmarks = Array.from(tagCounts.entries())
      .filter(([_, photos]) => photos.length >= 10)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10); // Top 10 landmarks

    console.log(`Identified ${landmarks.length} landmarks`);

    let landmarksCreated = 0;
    let hotspotsCreated = 0;
    let photosInserted = 0;

    // STEP 3: For each landmark, create hotspots
    for (const [landmarkTag, landmarkPhotos] of landmarks) {
      // Calculate landmark's approximate center (average of all photo subjects)
      const avgLat = landmarkPhotos.reduce((sum, p) => sum + p.latitude, 0) / landmarkPhotos.length;
      const avgLng = landmarkPhotos.reduce((sum, p) => sum + p.longitude, 0) / landmarkPhotos.length;

      // Create landmark entry
      const landmarkName = landmarkTag.replace(/([A-Z])/g, ' $1').trim(); // "RoyalOntarioMuseum" -> "Royal Ontario Museum"
      const coverPhoto = getFlickrPhotoUrl(landmarkPhotos[0], 'b');
      
      const landmarkId = await upsertLandmark(avgLat, avgLng, landmarkName, coverPhoto);
      landmarksCreated++;

      // STEP 4: Group photos by photographer location (hotspots)
      const hotspots = groupPhotosIntoHotspots(landmarkPhotos);
      console.log(`  ${landmarkName}: ${hotspots.size} hotspots found`);

      // STEP 5: Create hotspot entries
      for (const [hotspotKey, hotspotPhotos] of hotspots.entries()) {
        const [hotspotLat, hotspotLng] = hotspotKey.split(',').map(Number);
        const coverPhoto = getFlickrPhotoUrl(hotspotPhotos[0], 'b');

        // Create hotspot
        const hotspotId = await upsertHotspot(
          landmarkId,
          landmarkName,
          hotspotLat,
          hotspotLng,
          hotspotPhotos.length,
          coverPhoto
        );
        hotspotsCreated++;

        // Insert example photos for this hotspot
        await insertPhotosForHotspot(hotspotId, hotspotPhotos);
        photosInserted += hotspotPhotos.length;
      }
    }

    console.log(`Seeding complete: ${landmarksCreated} landmarks, ${hotspotsCreated} hotspots, ${photosInserted} photos`);
    
    return {
      success: true,
      landmarksCreated,
      hotspotsCreated,
      photosInserted,
      message: `Created ${landmarksCreated} landmarks with ${hotspotsCreated} photo hotspots`,
    };

  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  }
}
```

### Step 3: Create API Endpoint

Add to `backend/src/api/routes/spots.ts` (or create if doesn't exist):

```typescript
import { Router } from 'express';
import { seedPhotosForLocation } from '../../scripts/seedPhotosFromFlickr.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

/**
 * POST /v1/spots/seed
 * Seed spots and photos for a given location
 * 
 * Body: { lat: number, lng: number, radiusKm?: number }
 */
router.post('/seed', requireAuth, async (req, res) => {
  try {
    const { lat, lng, radiusKm = 5 } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: lat, lng',
      });
    }

    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates',
      });
    }

    const result = await seedPhotosForLocation(lat, lng, radiusKm);

    res.json(result);
  } catch (error) {
    console.error('Seed endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed photos',
    });
  }
});

export default router;
```

### Step 4: Add Hotspots Endpoint

You'll also need an endpoint to fetch hotspots for a specific landmark:

```typescript
/**
 * GET /v1/spots/:landmarkId/hotspots
 * Get all photography hotspots for a landmark
 */
router.get('/:landmarkId/hotspots', async (req, res) => {
  try {
    const { landmarkId } = req.params;
    
    // Fetch all hotspots (spots with category='hotspot' near this landmark)
    // For now, we'll fetch all spots in the area
    // Later, add parent_spot_id to properly link hotspots to landmarks
    
    const { data: landmark } = await supabase
      .from('spots')
      .select('lat, lng, name')
      .eq('id', landmarkId)
      .single();
    
    if (!landmark) {
      return res.status(404).json({ success: false, error: 'Landmark not found' });
    }
    
    // Find all hotspots near this landmark (within 500m)
    const { data: hotspots, error } = await supabase
      .rpc('api_spots_nearby', {
        lat: landmark.lat,
        lng: landmark.lng,
        radius_meters: 500,
      });
    
    if (error) {
      console.error('Error fetching hotspots:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch hotspots' });
    }
    
    // Filter to only hotspots (not landmarks)
    const filteredHotspots = hotspots.filter((s: any) => 
      s.categories?.includes('hotspot') && s.id !== landmarkId
    );
    
    res.json({ success: true, hotspots: filteredHotspots });
    
  } catch (error) {
    console.error('Hotspots endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch hotspots' });
  }
});
```

### Step 5: Register the Route

In `backend/src/app.ts`, add:

```typescript
import spotRoutes from './api/routes/spots.js';

// ... existing code ...

app.use('/v1/spots', spotRoutes);
```

### Step 6: Update Config (if needed)

Make sure `backend/src/config/index.ts` has Flickr config:

```typescript
externalApis: {
  flickr: {
    apiKey: process.env.FLICKR_API_KEY || '',
    apiSecret: process.env.FLICKR_API_SECRET || '',
  },
  // ... rest
}
```

## Usage Flow

### Frontend Integration

When a user logs in and opens the map:

```typescript
// 1. Get user's current location
const location = await Location.getCurrentPositionAsync({});

// 2. Call seed endpoint to populate landmarks/hotspots for this area
const seedResponse = await fetch('http://localhost:3000/v1/spots/seed', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`,
  },
  body: JSON.stringify({
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    radiusKm: 5, // Search within 5km
  }),
});

const seedResult = await seedResponse.json();
console.log(`Found ${seedResult.landmarksCreated} landmarks with ${seedResult.hotspotsCreated} hotspots`);

// 3. Fetch nearby landmarks to display on map
const landmarksResponse = await fetch(
  `http://localhost:3000/v1/spots/nearby?lat=${lat}&lng=${lng}&radius=5000`
);
const landmarks = await landmarksResponse.json();

// 4. Display landmarks on map (e.g., ROM, CN Tower)
// User sees pins for each landmark

// 5. When user taps a landmark (e.g., ROM):
const selectedLandmark = landmarks[0];

// 6. Fetch hotspots for that landmark
// You'll need a new endpoint: GET /v1/spots/:landmarkId/hotspots
const hotspotsResponse = await fetch(
  `http://localhost:3000/v1/spots/${selectedLandmark.id}/hotspots`
);
const hotspots = await hotspotsResponse.json();

// 7. Display hotspots around the landmark on map
// User sees multiple pins showing photography vantage points

// 8. When user taps a hotspot:
const selectedHotspot = hotspots[0];

// 9. Fetch example photos taken from that hotspot
const photosResponse = await fetch(
  `http://localhost:3000/v1/spots/${selectedHotspot.id}/photos`
);
const photos = await photosResponse.json();

// 10. Display photo gallery
// User swipes through photos taken from this vantage point

// 11. "Get Directions" button navigates to the hotspot
const url = Platform.select({
  ios: `maps://app?daddr=${selectedHotspot.lat},${selectedHotspot.lng}`,
  android: `google.navigation:q=${selectedHotspot.lat},${selectedHotspot.lng}`,
});
Linking.openURL(url);
```

## Performance Considerations

### Current Implementation (No Caching)

- Each seed call hits Flickr API (rate limited)
- Database inserts check for duplicates (prevents re-adding same photos)
- Suitable for development and initial testing

### Future: Redis Caching Layer

You mentioned implementing Redis caching later. Here's what you'll cache:

1. **Flickr API responses** (TTL: 24 hours):
   ```typescript
   const cacheKey = `flickr:search:${lat}:${lng}:${radius}`;
   const cached = await redis.get(cacheKey);
   if (cached) return JSON.parse(cached);
   ```

2. **Seeded location tracking** (TTL: 7 days):
   ```typescript
   // Track which areas have been seeded already
   const gridKey = `seeded:${Math.floor(lat * 100)}:${Math.floor(lng * 100)}`;
   const alreadySeeded = await redis.exists(gridKey);
   if (alreadySeeded) return { success: true, message: 'Already seeded' };
   ```

3. **Nearby spots queries** (TTL: 1 hour):
   ```typescript
   // Cache results from getNearbySpots
   const cacheKey = `spots:nearby:${lat}:${lng}:${radius}`;
   ```

## Testing

### Manual Test

```bash
# Start your backend
cd backend
npm run dev

# In another terminal, call the seed endpoint
curl -X POST http://localhost:3000/v1/spots/seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -d '{"lat": 40.7580, "lng": -73.9855, "radiusKm": 2}'
```

Replace with actual coordinates (e.g., Times Square, NYC shown above).

### Verify Results

```bash
# Check spots created
curl http://localhost:3000/v1/spots/nearby?lat=40.7580&lng=-73.9855&radius=3000

# Check photos for a spot (get spot_id from above)
curl http://localhost:3000/v1/photos?spot_id=SPOT_ID_HERE
```

## Flickr API Limits

- **Free tier**: 3,600 queries per hour
- **Per-page limit**: 100 photos max
- **Rate limiting**: Implement exponential backoff if needed

If you hit rate limits:
```typescript
async function searchFlickrPhotos(lat, lng, radiusKm, retries = 3) {
  try {
    // ... existing code
  } catch (error) {
    if (retries > 0 && error.message.includes('rate limit')) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
      return searchFlickrPhotos(lat, lng, radiusKm, retries - 1);
    }
    throw error;
  }
}
```

## Next Steps

1. **Implement the script** following steps above
2. **Test with your actual location** coordinates
3. **Verify database population** (check spots and photos tables)
4. **Wire up frontend** to call seed on login
5. **Add Redis caching** once basic flow works

## Troubleshooting

### "No photos found"
- Flickr may not have many geo-tagged photos in some areas
- Try increasing `radiusKm` to 10-20km
- Try a known photo-rich location (tourist spots, NYC, Paris, etc.)

### "Rate limit exceeded"
- Wait a few minutes and try again
- Implement retry logic with backoff
- Consider caching Flickr responses

### "Spot already exists"
- This is normal - the script detects duplicates
- The `original_key` field prevents re-inserting same photo

### Photos not showing on map
- Check that `visibility` is set to 'public'
- Verify RLS policies allow anonymous reads on photos table
- Ensure frontend is calling correct endpoint

## Database Schema Update (Recommended)

To properly link hotspots to landmarks, consider adding a `parent_spot_id` field:

```sql
ALTER TABLE spots ADD COLUMN parent_spot_id UUID REFERENCES spots(id);
ALTER TABLE spots ADD COLUMN spot_type VARCHAR(20) DEFAULT 'landmark'; -- 'landmark' or 'hotspot'

CREATE INDEX idx_spots_parent ON spots(parent_spot_id);
```

Then update the `upsertHotspot` function to set `parent_spot_id`:

```typescript
const { data: hotspot, error } = await supabase
  .from('spots')
  .insert({
    name: hotspotName,
    parent_spot_id: landmarkId, // Link to parent landmark
    spot_type: 'hotspot',
    lat: hotspotLat,
    lng: hotspotLng,
    // ... rest of fields
  })
```

This makes querying hotspots for a landmark much easier:

```sql
SELECT * FROM spots WHERE parent_spot_id = 'landmark-uuid-here'
```

## Summary

This seeding approach:
- ✅ Identifies popular landmarks near user (ROM, CN Tower, etc.)
- ✅ Finds photography hotspots around each landmark (where people stood to photograph it)
- ✅ Groups photos by vantage point (±10m accuracy)
- ✅ Creates two-level hierarchy: Landmarks → Hotspots → Photos
- ✅ Prevents duplicate photos
- ✅ Works on-demand when user opens the app
- ✅ Ready for Redis caching layer later
- ✅ Provides exact coordinates for navigation to photo spots

### The Key Insight

**Hotspots are not where the subject is, but where the photographer stood.**

When someone searches Flickr for photos tagged "ROM", the geo-coordinates tell us where the photographer was standing, not where the ROM is. By clustering these photographer positions, we find the best vantage points to photograph the landmark from.

Example:
- **Landmark**: Royal Ontario Museum (100 Queen's Park)
- **Hotspot 1**: Across the street at (43.6678, -79.3947) - 25 people stood here and photographed ROM
- **Hotspot 2**: In the park at (43.6684, -79.3938) - 18 people stood here
- **Hotspot 3**: On Philosopher's Walk at (43.6690, -79.3940) - 12 people stood here

User picks Hotspot 1 → Sees 25 example photos → Gets directions to (43.6678, -79.3947) → Takes their own photo of ROM from that proven spot.
