# Image Storage Implementation - Step-by-Step Guide

## 🎯 Goal
Implement photo upload with Supabase Storage, backend validation, and image processing.

---

## 📋 Pre-Implementation Checklist

Before you start, confirm you have:

- [ ] Backend server running (`npm run dev`)
- [ ] Access to Supabase dashboard (https://upqqejcbqstbfnrgiepu.supabase.co)
- [ ] Valid JWT token from test user (from auth setup)
- [ ] Supabase service role key in `.env` (already configured)
- [ ] `curl` or Postman for testing
- [ ] Node.js installed with npm

---

## Phase 1️⃣: Foundation (Storage Setup) - 15 min

### Step 1.1: Install Dependencies

```bash
cd /Users/akbar/Desktop/Expo/Photospots/backend

npm install multer sharp file-type
npm install --save-dev @types/multer
```

**Why:**
- `multer`: Parse multipart form data (file uploads)
- `sharp`: Resize images to create variants (w256, w512, w1024)
- `file-type`: Detect actual file type (MIME) from magic bytes
- `@types/multer`: TypeScript definitions

**Verify install:**
```bash
npm list multer sharp file-type
# Should show versions without errors
```

---

### Step 1.2: Create Storage Buckets via Supabase API

We'll create buckets programmatically using the admin SDK.

**Create a temporary setup script:**

```bash
cat > /tmp/setup-storage.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://upqqejcbqstbfnrgiepu.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwcXFlamNicXN0YmZucmdpZXB1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODQ5NDAyMiwiZXhwIjoyMDc0MDcwMDIyfQ.IZh6qFOZZ6CtSE-Kz6U3cHBPU6j7rLMbC4gDOlH8wik';

const admin = createClient(supabaseUrl, serviceKey);

async function setupBuckets() {
  console.log('🚀 Setting up storage buckets...\n');

  // Create "photos" bucket (private)
  try {
    const { data: bucket1, error: err1 } = await admin.storage.createBucket('photos', {
      public: false,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      fileSizeLimit: 10485760, // 10MB in bytes
    });
    
    if (err1 && err1.message.includes('already exists')) {
      console.log('✅ photos bucket already exists');
    } else if (err1) {
      console.error('❌ Error creating photos bucket:', err1);
    } else {
      console.log('✅ Created photos bucket:', bucket1);
    }
  } catch (e) {
    console.error('Error:', e);
  }

  // Create "photo-variants" bucket (public)
  try {
    const { data: bucket2, error: err2 } = await admin.storage.createBucket('photo-variants', {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/webp', 'image/avif'],
      fileSizeLimit: 5242880, // 5MB
    });
    
    if (err2 && err2.message.includes('already exists')) {
      console.log('✅ photo-variants bucket already exists');
    } else if (err2) {
      console.error('❌ Error creating photo-variants bucket:', err2);
    } else {
      console.log('✅ Created photo-variants bucket:', bucket2);
    }
  } catch (e) {
    console.error('Error:', e);
  }

  console.log('\n✨ Storage setup complete!');
}

setupBuckets();
EOF

# Run the setup script
npx tsx /tmp/setup-storage.ts
```

**Expected output:**
```
🚀 Setting up storage buckets...

✅ Created photos bucket: { ... }
✅ Created photo-variants bucket: { ... }

✨ Storage setup complete!
```

**What just happened:**
- Created `photos` bucket (private, for original uploads)
- Created `photo-variants` bucket (public, for processed images)
- Set file size limits and allowed MIME types

---

### Step 1.3: Configure CORS for Signed URLs

In Supabase dashboard:

1. Go to **Storage** → **Settings**
2. Under **CORS Configuration**, add:
```json
{
  "allowedOrigins": ["*"],
  "allowedMethods": ["GET", "HEAD"],
  "allowedHeaders": ["*"],
  "maxAgeSeconds": 3600
}
```

This allows your frontend to access signed URLs.

**Test CORS:**
```bash
curl -I https://upqqejcbqstbfnrgiepu.supabase.co/storage/v1/object/public/photo-variants/test
# Should return 200 or 404 (not CORS error)
```

---

## Phase 2️⃣: Backend Endpoint (Upload) - 1 hour

### Step 2.1: Update Config for Image Settings

**File: `src/config/index.ts`**

Add image upload configuration:

```typescript
export const config = {
  // ...existing config...
  
  images: {
    maxDimensions: parseInt(process.env.IMAGE_MAX_DIMENSIONS || '1024', 10),
    maxUploadMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10),
    cdnBaseUrl: process.env.CDN_BASE_URL || '',
    signedUrlExpiry: parseInt(process.env.SIGNED_URL_EXPIRY_SECONDS || '86400', 10),
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
};
```

**File: `.env`**

Add new variables:
```env
MAX_UPLOAD_SIZE_MB=10
SIGNED_URL_EXPIRY_SECONDS=86400
```

---

### Step 2.2: Create Photo Service

**File: `src/services/photoService.ts`** (new file)

```typescript
import crypto from 'crypto';
import sharp from 'sharp';
import { getSupabaseForRequest } from '../config/supabase.js';
import { config } from '../config/index.js';
import type { Photo, CreatePhotoInput } from '../types/photo.js';

export class PhotoService {
  /**
   * Calculate SHA256 hash of file buffer
   */
  static calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Upload photo to storage and create DB record
   */
  async uploadPhoto(
    file: Buffer,
    userId: string,
    spotId?: string,
    visibility: 'public' | 'private' = 'public',
    token?: string
  ): Promise<Photo> {
    // Generate photo ID
    const photoId = crypto.randomUUID();
    const sha256 = PhotoService.calculateHash(file);
    
    const supabase = getSupabaseForRequest(token);
    const adminSupabase = getSupabaseForRequest(token); // Would use service role ideally

    // Check for duplicate by SHA256
    const { data: existing } = await supabase
      .from('photos')
      .select('id')
      .eq('sha256', sha256)
      .eq('user_id', userId)
      .single();

    if (existing) {
      throw new Error(`Photo already uploaded: ${existing.id}`);
    }

    // Upload original to storage
    const storagePath = `${userId}/${photoId}/original`;
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(storagePath, file, {
        contentType: 'image/jpeg', // Should detect from file-type
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Create photo record in DB
    const { data: photo, error: dbError } = await supabase
      .from('photos')
      .insert({
        id: photoId,
        user_id: userId,
        spot_id: spotId,
        original_key: storagePath,
        sha256,
        visibility,
      })
      .select()
      .single();

    if (dbError) {
      throw new Error(`Failed to create photo record: ${dbError.message}`);
    }

    return photo as Photo;
  }

  /**
   * Generate signed URL for a photo variant
   */
  async getSignedUrl(
    bucketName: string,
    path: string,
    expirySeconds: number = config.images.signedUrlExpiry
  ): Promise<string> {
    const supabase = getSupabaseForRequest();
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(path, expirySeconds);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }
}
```

---

### Step 2.3: Create Upload Endpoint

**File: `src/api/routes/photos.ts`** (update)

```typescript
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { requireAuth } from '../middlewares/auth.js';
import { PhotoService } from '../services/photoService.js';
import { config } from '../config/index.js';
import sharp from 'sharp';

const router = Router();

// Configure multer for file upload (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.images.maxUploadMb * 1024 * 1024,
  },
});

/**
 * POST /v1/photos/upload
 * Upload a photo
 * 
 * Request:
 *   multipart/form-data
 *   - file: image file (required)
 *   - spot_id: UUID (optional)
 *   - visibility: 'public' | 'private' (optional, default 'public')
 * 
 * Response:
 *   { photo_id, variants: { w256, w512, w1024, avif } }
 */
router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Detect actual MIME type from file contents
    const detectedType = await fileTypeFromBuffer(req.file.buffer);
    if (!detectedType || !config.images.allowedMimeTypes.includes(detectedType.mime)) {
      return res.status(400).json({
        error: 'Invalid file type',
        allowedTypes: config.images.allowedMimeTypes,
      });
    }

    // Get image dimensions
    const metadata = await sharp(req.file.buffer).metadata();
    if (!metadata.width || !metadata.height) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    if (metadata.width > config.images.maxDimensions || 
        metadata.height > config.images.maxDimensions) {
      return res.status(400).json({
        error: `Image too large. Max ${config.images.maxDimensions}x${config.images.maxDimensions}px`,
      });
    }

    // Upload photo
    const photoService = new PhotoService();
    const photo = await photoService.uploadPhoto(
      req.file.buffer,
      userId,
      req.body.spot_id,
      req.body.visibility || 'public',
      req.token
    );

    // Generate signed URLs for variants
    // (In production, these would be updated by edge function)
    const variants = {
      original: await photoService.getSignedUrl('photos', photo.original_key),
    };

    res.json({
      success: true,
      photo_id: photo.id,
      variants,
      message: 'Photo uploaded. Processing variants...',
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(400).json({
      error: 'Upload failed',
      details: (error as Error).message,
    });
  }
});

/**
 * GET /v1/photos
 * List user's photos
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Would fetch from DB and generate signed URLs
    res.json({
      success: true,
      photos: [],
      message: 'Coming soon',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list photos' });
  }
});

export default router;
```

---

### Step 2.4: Update App.ts Middleware

**File: `src/app.ts`**

Add body size limit for multipart uploads:

```typescript
// Increase body size limit for image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

---

## Phase 3️⃣: Testing - 30 min

### Step 3.1: Prepare Test Image

```bash
# Create a small test image (1x1 pixel PNG)
python3 << 'EOF'
from PIL import Image
img = Image.new('RGB', (512, 512), color='red')
img.save('/tmp/test-photo.jpg')
print("Created /tmp/test-photo.jpg")
EOF

# Verify
file /tmp/test-photo.jpg
```

---

### Step 3.2: Test Upload Endpoint

```bash
# Get a valid token (from your test user)
TOKEN="eyJhbGciOiJIUzI1NiIsImtpZCI6IjVGakNzUW5DNkIzZW9tekgiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3VwcXFlamNicXN0YmZucmdpZXB1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJkZTA1NDAwOS0zNjk3LTRjMDQtYWRmMy1iNzhlNzEzZGM3MWYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYwODMwNjY3LCJpYXQiOjE3NjA4MjcwNjcsImVtYWlsIjoidGVzdHVzZXJAZGV2LmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzYwODI3MDY3fV0sInNlc3Npb25faWQiOiIxZTIwY2M5ZS04MTliLTQ2MTktYjJiZi05MWQ2NmMwODYyNjAiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.4Em5t8Rd0xjTMZ_h_8edgl3-x_nhf3g3AD4VxAjiBEY"

# Test upload
curl -X POST http://localhost:3000/v1/photos/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/test-photo.jpg" \
  -F "visibility=public"
```

**Expected response:**
```json
{
  "success": true,
  "photo_id": "...",
  "variants": {
    "original": "https://...signed-url..."
  },
  "message": "Photo uploaded. Processing variants..."
}
```

---

## ✅ Verification Checklist

After each step, verify:

- [ ] Dependencies installed (`npm list multer sharp file-type`)
- [ ] Buckets created (check Supabase Storage dashboard)
- [ ] Config updated with image limits
- [ ] PhotoService created and imports work
- [ ] Routes updated without TypeScript errors
- [ ] Server starts without errors (`npm run dev`)
- [ ] Test upload returns 200 with photo_id
- [ ] File appears in Supabase Storage
- [ ] Signed URL accessible in browser

---

## 🐛 Troubleshooting

### "Cannot find module 'multer'"
```bash
npm install multer @types/multer
npm run dev
```

### "File too large"
- Check `MAX_UPLOAD_SIZE_MB` in `.env`
- Verify multer limits in upload config

### "Upload fails with 401"
- Confirm token is valid: `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/auth/me`
- Check requireAuth middleware is applied

### "File appears in storage but record missing from DB"
- Check Supabase logs for RLS policy violation
- Verify user_id matches token

---

## 📝 Next Steps

Once Phase 2 works:

1. Move to **Phase 3**: Image processing (edge functions)
2. Then **Phase 4**: RLS policies testing
3. Then **Phase 5**: Deletion & cleanup
4. Finally: Connect frontend

---

