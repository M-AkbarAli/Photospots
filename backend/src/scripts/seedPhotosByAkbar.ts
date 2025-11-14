import { config } from '../config/index.js';
import { createClient } from '@supabase/supabase-js';

/**
 * STEP 1: Fetch photos from Flickr API
 * 
 * This function makes a request to Flickr to get photos that:
 * 1. Have GPS coordinates (geo-tagged)
 * 2. Are near a specific location (latitude, longitude)
 * 3. Are within a certain radius
 * 
 * The photos we get back include:
 * - Photo ID (unique identifier)
 * - Coordinates WHERE the photo was taken (photographer's location)
 * - Tags (what the photo is of)
 * - URLs to the photo
 * 
 * // 1. Create URL object
const url = new URL('https://api.flickr.com/services/rest/');

// 2. Add each parameter
url.searchParams.append('method', 'flickr.photos.search');
// This converts to: ?method=flickr.photos.search

url.searchParams.append('api_key', apiKey);
// This converts to: ?method=flickr.photos.search&api_key=YOUR_KEY

// 3. Make the request
const response = await fetch(url.toString());

// 4. Convert response to JSON
const data = await response.json();

// 5. Check if successful
if (data.stat !== 'ok') throw new Error(...);

// 6. Get the photos
const photos = data.photos.photo;
 */

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
  tags?: string;
}

interface FlickrResponse {
  photos: {
    photo: FlickrPhoto[];
    pages: number;
    total: number;
  };
  stat: string;
}

async function fetchFlickrPhotos(lat: number,lng: number, radiusKm: number = 5): Promise<FlickrPhoto[]> {
  
  // Get API key from config
  const apiKey = config.externalApis.flickr.apiKey;
  
  if (!apiKey) {
    throw new Error('FLICKR_API_KEY is not set in environment variables');
  }

  // STEP 1A: Build the URL with parameters
  const url = new URL('https://api.flickr.com/services/rest/');
  
  // STEP 1B: Add parameters one by one
  url.searchParams.append('method', 'flickr.photos.search');
  url.searchParams.append('api_key', apiKey);
  url.searchParams.append('lat', lat.toString());
  url.searchParams.append('lon', lng.toString());
  url.searchParams.append('radius', radiusKm.toString());
  url.searchParams.append('radius_units', 'km');
  url.searchParams.append('has_geo', '1'); // IMPORTANT: Only geotagged photos
  url.searchParams.append('accuracy', '16'); // Street-level accuracy
  url.searchParams.append('extras', 'geo,url_b,tags'); // Include geo coords, URLs, and tags
  url.searchParams.append('per_page', '250'); // Get up to 250 photos
  url.searchParams.append('format', 'json');
  url.searchParams.append('nojsoncallback', '1'); // Return pure JSON, not wrapped in callback

  
   try {
    // STEP 1C: Make the actual HTTP request
    
    const response = await fetch(url.toString());
    
    // STEP 1D: Check if HTTP request was successful
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    // STEP 1E: Parse the response as JSON
    const data = (await response.json()) as FlickrResponse;
    
    // STEP 1F: Check if Flickr API returned success
    if (data.stat !== 'ok') {
      throw new Error(`Flickr API error: ${data.stat}`);
    }

    // STEP 1G: Extract photos from response
    const photos = data.photos.photo || [];
    
    
    return photos;

  } catch (error) {
    console.error('❌ Error fetching from Flickr:', error);
    throw error;
  }
}

/**
 * STEP 2: Identify Landmarks by Analyzing Tags
 * 
 * Strategy:
 * 1. Look at all tags from all photos
 * 2. Count how many photos have each tag
 * 3. Filter out generic tags (toronto, ontario, canada, etc.)
 * 4. Keep only tags that appear 10+ times (indicates a real landmark)
 * 5. Sort by popularity (most photographed landmarks first)
 */

interface Landmark {
  name: string;
  photoCount: number;
  photos: FlickrPhoto[];
}

function identifyLandmarks(photos: FlickrPhoto[], minPhotoCount: number = 10): Landmark[] {
  
  
  // STEP 2A: Create a map to count tags
  // This will look like: { "ROM": [photo1, photo2, photo3, ...], "CN Tower": [...] }
  const tagToPhotos = new Map<string, FlickrPhoto[]>();
  
  // STEP 2B: Go through each photo and extract its tags
  for (const photo of photos) {
    if (!photo.tags) continue; // Skip photos with no tags
    
    // photo.tags is a space-separated string like "tag1 tag2 tag3"
    // We need to split it into individual tags
    const tags = photo.tags.split(' ');
    
    // For each tag in this photo
    for (const tag of tags) {
      if (!tag) continue; // Skip empty tags
      
      // Add this photo to the tag's list
      if (!tagToPhotos.has(tag)) {
        tagToPhotos.set(tag, []);
      }
      tagToPhotos.get(tag)!.push(photo);
    }
  }

  
  // STEP 2C: Filter out generic/uninteresting tags
  const genericTags = new Set([
    'toronto', 'ontario', 'canada', // Location names
    'photo', 'image', 'picture', 'photo', 'photooftheday', // Generic photo terms
    'camera', 'canon', 'nikon', 'sony', 'pentax', // Camera brands
    '2024', '2023', '2022', '2021','2025', '2020', '2019', // Years
    'the', 'a', 'an', 'and', 'or', 'in', 'at', 'on', // Articles/prepositions
    'streetphotography', 'street', 'urban', 'city', 'downtown', // Too generic
    'outdoor', 'outdoors', 'indoor', 'indoors', 'construction', 'torontoontario', // Too generic
    'fair', 'festival', 'event', 'night', 'day', // Time/events
    'window', 'windowdisplay', 'display', 'shop', 'store', 'bloor', 'street', // Generic locations
  ]);

  // STEP 2D: Convert to landmarks (keep only significant tags)
  const landmarks: Landmark[] = [];
  
  for (const [tag, photoList] of tagToPhotos.entries()) {
    // Skip if:
    // - Tag is in generic list
    // - Tag appears in fewer than minPhotoCount photos
    // - Tag is too short (probably not a landmark)
    if (genericTags.has(tag.toLowerCase()) || photoList.length < minPhotoCount || tag.length < 3) {
      continue;
    }
    
    landmarks.push({
      name: tag,
      photoCount: photoList.length,
      photos: photoList,
    });
  }

  // STEP 2E: Sort by photo count (most popular first)
  landmarks.sort((a, b) => b.photoCount - a.photoCount);

  
  return landmarks;
}

/**
 * STEP 3: Group Photos into Hotspots by Location
 * 
 * Strategy:
 * 1. For each landmark, take all its photos
 * 2. Look at WHERE each photo was taken (photographer's GPS location)
 * 3. Group photos that were taken from the same location (within ~10-15 meters)
 * 4. Each group = a hotspot (a proven photography vantage point)
 * 5. Filter out hotspots with <3 photos (need proof that it's a good spot)
 * 
 * Why precision matters:
 * - 4 decimal places = ~11 meters precision (good enough for "same spot")
 * - If 3+ photographers stood within 11m and photographed ROM, it's probably a good spot!
 */

interface Hotspot {
  lat: number;
  lng: number;
  photoCount: number;
  photos: FlickrPhoto[];
}

function groupPhotosIntoHotspots(landmark: Landmark, minPhotosPerHotspot: number = 3): Hotspot[] {
  

  // STEP 3A: Define precision - round coordinates to 4 decimal places
  // This gives us ~11 meter accuracy (good for "same spot")
  const PRECISION = 4;

  // STEP 3B: Create a map: hotspotKey -> list of photos from that key
  // Hotspot key looks like: "43.6678,-79.3947"
  const hotspotMap = new Map<string, FlickrPhoto[]>();

  // STEP 3C: Go through each photo of this landmark
  for (const photo of landmark.photos) {
    if (!photo.latitude || !photo.longitude) continue;

    // Convert to numbers and ensure they're numbers (Flickr sometimes returns strings)
    //(condition) ? (value if true) : (value if false)

    const lat = typeof photo.latitude === 'string' ? parseFloat(photo.latitude) : photo.latitude;
    const lng = typeof photo.longitude === 'string' ? parseFloat(photo.longitude) : photo.longitude;

    // Round coordinates to create hotspot key
    // Example: 43.66789 rounds to 43.6679 (at precision 4)
    const hotspotKey = `${lat.toFixed(PRECISION)},${lng.toFixed(PRECISION)}`;

    // Add this photo to the hotspot group
    if (!hotspotMap.has(hotspotKey)) {
      hotspotMap.set(hotspotKey, []);
    }
    hotspotMap.get(hotspotKey)!.push(photo);
  }

  // STEP 3D: Convert to hotspots array, filtering weak spots
  const hotspots: Hotspot[] = [];

  for (const [hotspotKey, photos] of hotspotMap.entries()) {
    // Skip hotspots with too few photos (not proven)
    if (photos.length < minPhotosPerHotspot) {  
      continue;
    }

    const [latStr, lngStr] = hotspotKey.split(',');
    hotspots.push({
      lat: parseFloat(latStr),
      lng: parseFloat(lngStr),
      photoCount: photos.length,
      photos,
    });
  }

  // STEP 3E: Sort by popularity (most photographed first)
  hotspots.sort((a, b) => b.photoCount - a.photoCount);

  

  return hotspots;
}

/**
 * STEP 4: Insert Data into Supabase Database
 * 
 * Strategy:
 * 1. For each landmark, INSERT into spots table
 * 2. Get the landmark's ID
 * 3. For each hotspot, INSERT into spots table
 * 4. For each photo, INSERT into photos table (linked to hotspot)
 * 5. Handle duplicates gracefully (don't fail if already exists)
 */

function getFlickrPhotoUrl(photo: FlickrPhoto, size: string = 'b'): string {
  // Construct Flickr photo URL from components
  // Size codes: s=small, m=medium, b=large, o=original
  return `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_${size}.jpg`;
}

async function insertLandmarkAndHotspots(supabase: any, landmark: Landmark, hotspots: Hotspot[]): Promise<{ landmarkId: string; hotspotIds: string[] }> {
  

  try {
    // STEP 4A: Calculate landmark center (average of all photo locations)
    let avgLat = 0;
    let avgLng = 0;
    for (const photo of landmark.photos) {
      const lat = typeof photo.latitude === 'string' ? parseFloat(photo.latitude) : photo.latitude;
      const lng = typeof photo.longitude === 'string' ? parseFloat(photo.longitude) : photo.longitude;
      avgLat += lat;
      avgLng += lng;
    }
    avgLat /= landmark.photos.length;
    avgLng /= landmark.photos.length;

    // Get a cover photo URL
    const coverPhotoUrl = getFlickrPhotoUrl(landmark.photos[0], 'b');

    // STEP 4B: Check if landmark already exists
    const { data: existingLandmark } = await supabase
      .from('spots')
      .select('id')
      .eq('name', landmark.name)
      .eq('source', 'flickr')
      .single();

    let landmarkId: string;

    if (existingLandmark) {
      // Landmark already exists, reuse it
      landmarkId = (existingLandmark as any).id;
      
    } else {
      // STEP 4C: Insert new landmark
      const { data: newLandmark, error: landmarkError } = await supabase
        .from('spots')
        .insert({
          name: landmark.name,
          lat: avgLat,
          lng: avgLng,
          geom: `POINT(${avgLng} ${avgLat})`,  // PostGIS geometry: longitude first!
          photo_url: coverPhotoUrl,
          source: 'flickr',
          score: Math.min(landmark.photoCount / 50, 1),
          categories: ['landmark'],
          description: `Landmark with ${landmark.photoCount} photos from Flickr`,
        } as any)
        .select('id')
        .single();

      if (landmarkError) {
        console.error(`    ❌ Error inserting landmark: ${landmarkError.message}`);
        throw landmarkError;
      }

      landmarkId = (newLandmark as any).id;
      
    }

    // STEP 4D: Insert hotspots for this landmark
    const hotspotIds: string[] = [];

    for (const hotspot of hotspots) {
      

      // Check if hotspot already exists
      const { data: existingHotspot } = await supabase
        .from('spots')
        .select('id')
        .eq('lat', hotspot.lat)
        .eq('lng', hotspot.lng)
        .eq('source', 'flickr')
        .single();

      let hotspotId: string;

      if (existingHotspot) {
        hotspotId = (existingHotspot as any).id;
        
      } else {
        const coverPhoto = getFlickrPhotoUrl(hotspot.photos[0], 'b');

        const { data: newHotspot, error: hotspotError } = await supabase
          .from('spots')
          .insert({
            name: `Hotspot for ${landmark.name}`,
            lat: hotspot.lat,
            lng: hotspot.lng,
            geom: `POINT(${hotspot.lng} ${hotspot.lat})`,  // PostGIS geometry: longitude first!
            photo_url: coverPhoto,
            source: 'flickr',
            score: Math.min(hotspot.photoCount / 10, 1),
            categories: ['hotspot'],
            description: `${hotspot.photoCount} photos of ${landmark.name} taken from here`,
          } as any)
          .select('id')
          .single();

        if (hotspotError) {
          console.error(`      ❌ Error inserting hotspot: ${hotspotError.message}`);
          throw hotspotError;
        }

        hotspotId = (newHotspot as any).id;
      }

      hotspotIds.push(hotspotId);

      // STEP 4E: Insert photos for this hotspot
      await insertPhotosForHotspot(supabase, hotspotId, hotspot.photos);
    }

    return { landmarkId, hotspotIds };
  } catch (error) {
    console.error(`❌ Error inserting landmark data:`, error);
    throw error;
  }
}

async function insertPhotosForHotspot(
  supabase: any,
  hotspotId: string,
  photos: FlickrPhoto[]
): Promise<void> {

  try {
    // Build photo records
    const photoRecords = photos.map(photo => ({
      spot_id: hotspotId,
      user_id: null,
      original_key: `flickr:${photo.id}`,
      variants: {
        small: getFlickrPhotoUrl(photo, 's'),
        medium: getFlickrPhotoUrl(photo, 'm'),
        large: getFlickrPhotoUrl(photo, 'b'),
        original: getFlickrPhotoUrl(photo, 'o'),
      },
      width: null,
      height: null,
      sha256: null,
      visibility: 'public',
    }));

    // Check which photos already exist
    const existingKeys = photos.map(p => `flickr:${p.id}`);
    const { data: existingPhotos } = await supabase
      .from('photos')
      .select('original_key')
      .eq('spot_id', hotspotId)
      .in('original_key', existingKeys);

    const existingSet = new Set(existingPhotos?.map((p: any) => p.original_key) || []);
    const newPhotos = photoRecords.filter(p => !existingSet.has(p.original_key));

    if (newPhotos.length === 0) {
      
      return;
    }

    // Insert new photos
    const { error: photosError } = await supabase
      .from('photos')
      .insert(newPhotos as any);

    if (photosError) {
      console.error(`      ❌ Error inserting photos: ${photosError.message}`);
      throw photosError;
    }

    
  } catch (error) {
    console.error(`❌ Error inserting photos:`, error);
    throw error;
  }
}

/**
 * Main function - TEST ALL STEPS 1-4
 * Run this with: npx tsx src/scripts/seedPhotosByAkbar.ts
 */
async function main() {
  try {
    console.log('\n🚀 STEP 1-4: Full Seed Pipeline\n');

    const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

    if (!config.supabase.url || !config.supabase.serviceKey) {
      throw new Error('Supabase credentials not configured');
    }

    const lat = 43.667713;
    const lng = -79.394913;
    const radiusKm = 5;

    console.log('=== STEP 1: Fetching from Flickr ===');
    const photos = await fetchFlickrPhotos(lat, lng, radiusKm);
    console.log(`✅ Fetched ${photos.length} photos\n`);

    console.log('=== STEP 2: Identifying Landmarks ===');
    const landmarks = identifyLandmarks(photos, 10);
    console.log(`✅ Identified ${landmarks.length} landmarks\n`);

    if (landmarks.length === 0) {
      console.log('⚠️  No landmarks found');
      process.exit(0);
    }

    console.log('=== STEP 3: Grouping into Hotspots ===');
    const landmarkHotspots: Map<string, Hotspot[]> = new Map();
    
    for (const landmark of landmarks) {
      const hotspots = groupPhotosIntoHotspots(landmark, 3);
      if (hotspots.length > 0) {
        landmarkHotspots.set(landmark.name, hotspots);
      }
    }
    console.log(`✅ Found hotspots\n`);

    console.log('=== STEP 4: Inserting into Database ===');
    let totalInserted = { landmarks: 0, hotspots: 0, photos: 0 };

    for (const landmark of landmarks) {
      const hotspots = landmarkHotspots.get(landmark.name) || [];
      if (hotspots.length === 0) continue;

      try {
        const result = await insertLandmarkAndHotspots(supabase, landmark, hotspots);
        totalInserted.landmarks++;
        totalInserted.hotspots += result.hotspotIds.length;
        for (const hotspot of hotspots) {
          totalInserted.photos += hotspot.photos.length;
        }
      } catch (error) {
        console.error(`⚠️  Skipped ${landmark.name}`);
      }
    }

    console.log('\n========== 🎉 COMPLETE! ==========');
    console.log(`✅ STEP 1: Fetched ${photos.length} photos`);
    console.log(`✅ STEP 2: Identified ${landmarks.length} landmarks`);
    console.log(`✅ STEP 3: Found hotspots`);
    console.log(`✅ STEP 4: Database insertion complete`);
    console.log(`\nDatabase Summary: ${totalInserted.landmarks} landmarks, ${totalInserted.hotspots} hotspots, ${totalInserted.photos} photos`);
    console.log('\n✨ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Export functions for API endpoint integration
export {
  fetchFlickrPhotos,
  identifyLandmarks,
  groupPhotosIntoHotspots,
  insertLandmarkAndHotspots,
  insertPhotosForHotspot,
};

// Run the main function only if executed directly
main();