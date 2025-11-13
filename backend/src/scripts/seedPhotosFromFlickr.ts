import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

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