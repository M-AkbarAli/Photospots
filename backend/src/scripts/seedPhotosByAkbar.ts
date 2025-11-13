import { config } from '../config/index.js';

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
  console.log(`\n📍 Fetching photos from Flickr for location: ${lat}, ${lng} (radius: ${radiusKm}km)`);
  
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
    console.log('Making request to Flickr API');
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
    console.log(`✅ Successfully fetched ${photos.length} photos from Flickr`);
    
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
  console.log('\n📍 STEP 2: Identifying Landmarks...');
  
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

  console.log(`\n📊 Found ${tagToPhotos.size} unique tags`);

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

  console.log(`✅ Identified ${landmarks.length} landmarks (with 10+ photos each)`);
  
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

function groupPhotosIntoHotspots(
  landmark: Landmark,
  minPhotosPerHotspot: number = 3
): Hotspot[] {
  console.log(`\n  📍 Grouping photos for landmark: ${landmark.name}`);

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

  console.log(`    ✅ Found ${hotspots.length} hotspots (${minPhotosPerHotspot}+ photos each)`);

  return hotspots;
}

/**
 * Main function - TEST STEPS 1, 2 & 3
 * Run this with: npx tsx src/scripts/seedPhotosByAkbar.ts
 */
async function main() {
  try {
    console.log('\n🚀 STEP 1, 2 & 3: Fetch, Identify Landmarks, Group into Hotspots\n');

    // Toronto downtown
    const lat = 43.6629;
    const lng = -79.3957;
    const radiusKm = 5;

    // === STEP 1: Fetch Photos ===
    const photos = await fetchFlickrPhotos(lat, lng, radiusKm);
    console.log(`\n📸 Fetched ${photos.length} photos`);

    // === STEP 2: Identify Landmarks ===
    const landmarks = identifyLandmarks(photos, 10); // Keep landmarks with 10+ photos

    // Display results
    console.log('\n========== STEP 2 RESULTS: TOP LANDMARKS ==========\n');
    
    if (landmarks.length > 0) {
      // Show all landmarks sorted by popularity
      landmarks.forEach((landmark, index) => {
        console.log(`${index + 1}. ${landmark.name.toUpperCase()}`);
        console.log(`   � Photos: ${landmark.photoCount}`);
        console.log(`   🏷️  Sample tags: ${landmark.photos[0].tags?.split(' ').slice(0, 5).join(', ') || 'none'}`);
        console.log();
      });
    } else {
      console.log('⚠️  No landmarks found with 10+ photos');
    }

    // Summary
    console.log('========== SUMMARY ==========');
    console.log(`\n✅ STEP 1: Fetched ${photos.length} geotagged photos from Flickr`);
    console.log(`✅ STEP 2: Identified ${landmarks.length} landmarks (tags with 10+ photos)`);
    console.log('\nTop 5 Landmarks:');
    landmarks.slice(0, 5).forEach((landmark, index) => {
      console.log(`  ${index + 1}. ${landmark.name}: ${landmark.photoCount} photos`);
    });
    // === STEP 3: Group into Hotspots ===
    console.log('\n========== STEP 3: Grouping into Hotspots ==========');
    
    const landmarkHotspots: Map<string, Hotspot[]> = new Map();
    
    for (const landmark of landmarks) {
      const hotspots = groupPhotosIntoHotspots(landmark, 3);
      if (hotspots.length > 0) {
        landmarkHotspots.set(landmark.name, hotspots);
      }
    }

    // Display results
    console.log('\n========== STEP 3 RESULTS: LANDMARKS & HOTSPOTS ==========\n');

    let totalHotspots = 0;
    
    for (const [landmarkName, hotspots] of landmarkHotspots.entries()) {
      console.log(`\n🏛️  ${landmarkName.toUpperCase()}`);
      console.log(`   📊 Total photos: ${landmarks.find(l => l.name === landmarkName)?.photoCount}`);
      console.log(`   📍 Hotspots found: ${hotspots.length}`);

      hotspots.slice(0, 5).forEach((hotspot, index) => {
        console.log(`   \n   Hotspot ${index + 1}:`);
        console.log(`     📍 Coordinates: (${hotspot.lat}, ${hotspot.lng})`);
        console.log(`     📸 Photos: ${hotspot.photoCount}`);
        console.log(`     🗺️  Map: https://maps.google.com/?q=${hotspot.lat},${hotspot.lng}`);
      });

      totalHotspots += hotspots.length;
    }

    // Summary
    console.log('\n\n========== SUMMARY ==========');
    console.log(`\n✅ STEP 1: Fetched ${photos.length} geotagged photos from Flickr`);
    console.log(`✅ STEP 2: Identified ${landmarks.length} landmarks`);
    console.log(`✅ STEP 3: Found ${totalHotspots} photography hotspots`);
    console.log('\n📊 Data breakdown:');
    if (landmarks.length > 0) {
      console.log(`   - Photos per landmark: ${(photos.length / landmarks.length).toFixed(1)} avg`);
      console.log(`   - Hotspots per landmark: ${(totalHotspots / landmarks.length).toFixed(1)} avg`);
    }
    console.log('\n✅ STEPS 1, 2 & 3 COMPLETE: Ready for STEP 4 (database insertion)');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();