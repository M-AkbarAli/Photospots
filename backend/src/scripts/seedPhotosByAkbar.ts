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

async function fetchFlickrPhotos(
  lat: number,
  lng: number,
  radiusKm: number = 5
): Promise<FlickrPhoto[]> {
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

  
   /* try {
    // STEP 1C: Make the actual HTTP request
    console.log('⏳ Making request to Flickr API...');
    const response = await fetch(url.toString());
    
    // STEP 1D: Check if HTTP request was successful
    if (!response.ok) {
      throw new Error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
    }

    // STEP 1E: Parse the response as JSON
    const data = (await response.json()) as FlickrResponse;
    
    // STEP 1F: Check if Flickr API returned success
    if (data.stat !== 'ok') {
      throw new Error(`❌ Flickr API error: ${data.stat}`);
    }

    // STEP 1G: Extract photos from response
    const photos = data.photos.photo || [];
    console.log(`✅ Successfully fetched ${photos.length} photos from Flickr`);
    
    return photos;

  } catch (error) {
    console.error('❌ Error fetching from Flickr:', error);
    throw error;
  } */
}

/**
 * Main function - TEST STEP 1
 * Run this with: npm run ts-node src/scripts/seedPhotosByAkbar.ts
 */
async function main() {
  try {
    console.log('\n🚀 STEP 1: Testing Flickr API Fetch\n');

    // You can change these coordinates to test different locations!
    // Toronto downtown:
    const lat = 43.6629;
    const lng = -79.3957;
    const radiusKm = 5;
    
    // Try other locations by uncommenting:
    // Times Square, NYC:
    // const lat = 40.758;
    // const lng = -73.9855;
    
    // Eiffel Tower, Paris:
    // const lat = 48.8584;
    // const lng = 2.2945;

    // Call our function to fetch photos
    const photos = await fetchFlickrPhotos(lat, lng, radiusKm);

    // Display results
    console.log('\n========== STEP 1 RESULTS ==========');
    console.log(`✅ Total photos fetched: ${photos.length}\n`);

    // Show details of first 3 photos as examples
    if (photos.length > 0) {
      console.log('📸 First 3 photos details:\n');
      photos.slice(0, 3).forEach((photo, index) => {
        console.log(`Photo ${index + 1}:`);
        console.log(`  📷 ID: ${photo.id}`);
        console.log(`  🏷️  Title: ${photo.title}`);
        console.log(`  📍 Coordinates: (${photo.latitude}, ${photo.longitude})`);
        console.log(`  🎯 Accuracy: ${photo.accuracy}`);
        console.log(`  🏷️  Tags: ${photo.tags || 'none'}`);
        console.log();
      });
    }

    // Summary
    console.log('========== SUMMARY ==========');
    console.log(`Successfully fetched ${photos.length} geotagged photos from Flickr`);
    console.log('These photos have GPS coordinates telling us where the photographer stood!');
    console.log('\n✅ STEP 1 COMPLETE: Ready to move to STEP 2 (identifying landmarks)');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();