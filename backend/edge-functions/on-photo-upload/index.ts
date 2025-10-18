// Follow this doc to learn about Supabase Edge Functions:
// https://supabase.com/docs/guides/functions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface PhotoUploadPayload {
  type: 'INSERT';
  table: 'photos';
  record: {
    id: string;
    user_id: string;
    spot_id?: string;
    original_key: string;
    width?: number;
    height?: number;
  };
  old_record: null;
}

serve(async (req) => {
  try {
    const payload: PhotoUploadPayload = await req.json();
    
    console.log('Photo upload triggered:', payload.record.id);

    // TODO: Generate image variants (w256, w512, w1024, avif)
    // This is a placeholder - implement actual image processing
    // You could use:
    // 1. Deno's image processing libraries
    // 2. Call external service (Cloudinary, Imgix)
    // 3. Trigger a separate worker service

    const variants = {
      w256: `variants/${payload.record.user_id}/${payload.record.id}/w256.jpg`,
      w512: `variants/${payload.record.user_id}/${payload.record.id}/w512.jpg`,
      w1024: `variants/${payload.record.user_id}/${payload.record.id}/w1024.jpg`,
    };

    // Update photo record with variants
    const { error: updateError } = await supabase
      .from('photos')
      .update({ variants })
      .eq('id', payload.record.id);

    if (updateError) {
      throw updateError;
    }

    // Optional: Extract GPS from EXIF and suggest spot linkage
    // TODO: Implement EXIF extraction

    return new Response(
      JSON.stringify({ 
        success: true,
        photo_id: payload.record.id,
        variants,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Error processing photo upload:', error);
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
