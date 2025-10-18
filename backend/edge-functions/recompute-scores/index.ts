// Supabase Edge Function for recomputing spot scores
// Schedule this to run daily/weekly via Supabase Cron

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const flickrApiKey = Deno.env.get('FLICKR_API_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Calculate spot score based on multiple factors
 */
function calculateScore(stats: {
  photo_density: number;
  recency_trend: number;
  opentrip_popularity: number;
  flickr_photo_count: number;
}): number {
  // Weights (adjust these based on your preferences)
  const w_photo = 0.4;
  const w_recency = 0.2;
  const w_popularity = 0.3;
  const w_flickr = 0.1;

  // Normalize values (0-100 scale)
  const photoScore = Math.min(stats.photo_density * 10, 100);
  const recencyScore = Math.min(stats.recency_trend * 100, 100);
  const popularityScore = Math.min(stats.opentrip_popularity, 100);
  const flickrScore = Math.min(stats.flickr_photo_count / 10, 100);

  const totalScore = 
    photoScore * w_photo +
    recencyScore * w_recency +
    popularityScore * w_popularity +
    flickrScore * w_flickr;

  return Math.round(totalScore * 100) / 100; // Round to 2 decimals
}

serve(async (_req) => {
  try {
    console.log('Starting score recomputation...');

    // Fetch all spots
    const { data: spots, error: spotsError } = await supabase
      .from('spots')
      .select('id, lat, lng');

    if (spotsError) throw spotsError;

    let updated = 0;
    let errors = 0;

    // Process each spot
    for (const spot of spots || []) {
      try {
        // Get spot stats
        const { data: stats } = await supabase
          .from('spot_stats')
          .select('*')
          .eq('spot_id', spot.id)
          .single();

        // If no stats exist, create default
        const spotStats = stats || {
          photo_density: 0,
          recency_trend: 0,
          opentrip_popularity: 0,
          flickr_photo_count: 0,
        };

        // TODO: Enrich with Flickr data if API key is available
        // if (flickrApiKey) {
        //   const flickrCount = await fetchFlickrPhotoCount(spot.lat, spot.lng);
        //   spotStats.flickr_photo_count = flickrCount;
        // }

        // Calculate new score
        const newScore = calculateScore(spotStats);

        // Update spot
        const { error: updateError } = await supabase
          .from('spots')
          .update({ score: newScore })
          .eq('id', spot.id);

        if (updateError) throw updateError;

        updated++;
      } catch (error) {
        console.error(`Error updating spot ${spot.id}:`, error);
        errors++;
      }
    }

    console.log(`Score recomputation complete: ${updated} updated, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true,
        updated,
        errors,
        total: spots?.length || 0,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Error in score recomputation:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
