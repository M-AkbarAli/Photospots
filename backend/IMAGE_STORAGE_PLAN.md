# Image Storage Implementation Plan

**Status**: Planning Phase  
**Date**: October 18, 2025  
**Goal**: Implement photo upload, storage, and management with Supabase Storage

---

## 📋 Current State Analysis

### What Already Exists
- ✅ `photos` table with schema: `id, user_id, spot_id, original_key, variants (JSONB), width, height, sha256, visibility, created_at`
- ✅ Row-Level Security (RLS) policies on photos table for access control
- ✅ `on-photo-upload` edge function skeleton (needs implementation)
- ✅ Photo types defined in `src/types/photo.ts`
- ✅ Basic photo routes in `src/api/routes/photos.ts` (endpoints return 501 Not Implemented)
- ✅ Environment variables configured: `IMAGE_MAX_DIMENSIONS`, `CDN_BASE_URL`

### What Needs Implementation
- ❌ Supabase Storage buckets (photos, photo-variants)
- ❌ POST `/v1/photos/upload` endpoint with multipart form parsing
- ❌ File validation (type, size, dimensions)
- ❌ Image processing (resize to variants: w256, w512, w1024, avif)
- ❌ Signed URL generation for serving images
- ❌ RLS policies on storage buckets
- ❌ Cleanup/deletion logic
- ❌ CORS configuration for frontend access

---

## 🎯 Implementation Architecture

### Bucket Structure (Supabase Storage)

```
Bucket: "photos"
├── {user_id}/{photo_id}/
│   ├── original.jpg           # Original uploaded file
│   └── metadata.json          # EXIF, dimensions, hash

Bucket: "photo-variants"
├── {user_id}/{photo_id}/
│   ├── w256.jpg              # Thumbnail (256px)
│   ├── w512.jpg              # Small (512px)
│   ├── w1024.jpg             # Medium (1024px)
│   └── w1024.avif            # Modern format
```

### Flow: Photo Upload to Serving

```
1. Frontend sends multipart/form-data to POST /v1/photos/upload
   ├─ Image file (binary)
   ├─ spot_id (optional)
   └─ visibility (optional)

2. Backend validates
   ├─ Auth check (requireAuth middleware)
   ├─ File type check (image/jpeg, image/png, image/webp only)
   ├─ File size check (max 10MB)
   ├─ Image dimensions check (max 4096x4096)
   └─ SHA256 hash for deduplication

3. Create photo record in DB
   ├─ INSERT INTO photos table with user_id, spot_id, original_key
   └─ Store SHA256 to prevent duplicates

4. Upload original to Supabase Storage
   └─ photos/{user_id}/{photo_id}/original.jpg

5. Trigger image processing (Edge Function)
   ├─ Generate 3 image variants (w256, w512, w1024)
   ├─ Convert to AVIF if supported
   ├─ Upload to photo-variants bucket
   └─ Update photo.variants JSONB in DB

6. Return signed URLs to frontend
   └─ Include URLs for all variants with expiry
```

### Database Integration
- Photo record inserted before storage upload (transactional safety)
- SHA256 hash stored for deduplication
- Variants stored as JSONB map: `{ "w256": "signed_url", "w512": "...", ... }`
- On photo delete: cascade delete from storage + DB

---

## ⚠️ Potential Issues & Mitigation

### 1. **File Upload Size Limits**
- **Issue**: Express default bodyParser limit is 100KB; photos are typically 1-5MB
- **Mitigation**: Configure `express.json({ limit: '50mb' })` and `express.urlencoded({ limit: '50mb' })`
- **Prevention**: Set max file size to 10MB in config, validate on backend

### 2. **Concurrent Upload Conflicts**
- **Issue**: Two users uploading same image simultaneously could create duplicates
- **Mitigation**: Use SHA256 hash as deduplication key; if hash exists and same user, reuse ID
- **Fallback**: Database unique constraint on (user_id, sha256)

### 3. **Path Injection / Security**
- **Issue**: Malicious users could try `/../../admin/` paths in file uploads
- **Mitigation**: Never use user-provided filenames; always generate UUIDs for file paths
- **Enforce**: Bucket paths hardcoded as `{user_id}/{photo_id}/original.jpg` only

### 4. **Image Processing Failures**
- **Issue**: Edge function crashes during resize → orphaned records in DB
- **Mitigation**: 
  - Mark photo with `processing_status: 'pending'` while variants generate
  - On edge function failure, trigger retry or fallback to original only
  - Implement monitoring/alerts for edge function errors

### 5. **Signed URL Expiry**
- **Issue**: Signed URLs expire after 1 hour (default); old cached URLs fail
- **Mitigation**: Set longer expiry (24 hours) for public photos; regenerate on request
- **Frontend Cache**: Don't cache URLs; fetch fresh variants list on each view

### 6. **RLS Policy Bypasses**
- **Issue**: Incorrect RLS policies could allow users to read/delete others' photos
- **Mitigation**: 
  - Policies must check `auth.uid() = user_id` for private uploads
  - Public photos readable by anyone but deletable only by owner
  - Test RLS with authenticated and unauthenticated requests

### 7. **Storage Quota Exceeded**
- **Issue**: Supabase has storage limits; too many uploads could exceed quota
- **Mitigation**: Implement cleanup job for orphaned/old photos
- **Monitor**: Track storage usage, alert when >80% quota used

### 8. **CORS Issues**
- **Issue**: Frontend app on different domain can't access signed URLs
- **Mitigation**: Configure Supabase Storage CORS headers to allow frontend domain
- **Test**: Browser DevTools → Network tab check for CORS errors

### 9. **Image Validation Bypass**
- **Issue**: Users upload executable files disguised as images
- **Mitigation**: 
  - Validate MIME type from file headers (magic bytes), not just extension
  - Use library like `file-type` to detect actual file type
  - Reject if actual type ≠ declared type

### 10. **Database Transaction Failures**
- **Issue**: Photo inserted in DB but storage upload fails → orphaned record
- **Mitigation**: 
  - Insert photo record AFTER successful storage upload
  - Or use try/catch with rollback on storage upload failure
  - Implement cleanup job for orphaned records (storage exists but no DB entry)

---

## 🔧 Implementation Checklist

### Phase 1: Storage Setup
- [ ] Create Supabase Storage buckets via API:
  - [ ] `photos` bucket (private by default)
  - [ ] `photo-variants` bucket (public with signed URLs)
  - [ ] Confirm buckets created with correct permissions

### Phase 2: Backend Endpoint
- [ ] Add multipart form parsing middleware (e.g., `multer`)
- [ ] Implement POST `/v1/photos/upload`:
  - [ ] Extract file from request body
  - [ ] Validate file type (image/jpeg, image/png, image/webp)
  - [ ] Validate file size (≤10MB)
  - [ ] Get image dimensions and validate (≤4096x4096)
  - [ ] Calculate SHA256 hash
  - [ ] Check for duplicates (existing SHA256 from same user)
  - [ ] Create photo record in DB
  - [ ] Upload to `photos/{user_id}/{photo_id}/original`
  - [ ] Trigger edge function for variants
  - [ ] Return signed URLs for all variants

### Phase 3: Image Processing
- [ ] Implement `on-photo-upload` edge function:
  - [ ] Download original from storage
  - [ ] Resize to w256, w512, w1024
  - [ ] Convert to AVIF if supported
  - [ ] Upload variants to `photo-variants` bucket
  - [ ] Update DB with variant URLs
  - [ ] Handle errors gracefully (retry logic)

### Phase 4: RLS & Security
- [ ] Create Storage RLS policies:
  - [ ] `photos` bucket: only owner can read/write
  - [ ] `photo-variants` bucket: public read with signed URLs
  - [ ] Test policies with authenticated/unauthenticated users
- [ ] Validate image upload auth (requireAuth middleware)
- [ ] Test path injection scenarios

### Phase 5: Cleanup & Deletion
- [ ] Implement DELETE `/v1/photos/{photoId}`:
  - [ ] Verify ownership (only user can delete own photos)
  - [ ] Delete from storage (`photos` and `photo-variants`)
  - [ ] Delete from database
  - [ ] Handle cascading deletes (if spot deleted, delete photos)
- [ ] Implement orphan cleanup job:
  - [ ] Find photos in DB with missing storage files
  - [ ] Find storage files without DB records
  - [ ] Clean up based on age/priority

### Phase 6: Testing
- [ ] Test upload with various file types (jpg, png, webp, invalid)
- [ ] Test size limits (valid 5MB, invalid 15MB)
- [ ] Test concurrent uploads (2+ users uploading same image)
- [ ] Test RLS (can't access other users' photos)
- [ ] Test signed URL generation and expiry
- [ ] Test deletion workflow
- [ ] Test edge cases: corrupted images, invalid EXIF, huge dimensions

### Phase 7: Documentation
- [ ] Update GETTING_STARTED.md with storage setup
- [ ] Document API endpoints:
  - [ ] POST `/v1/photos/upload`
  - [ ] GET `/v1/photos`
  - [ ] DELETE `/v1/photos/{photoId}`
- [ ] Document error responses

---

## 📦 Dependencies to Install

```bash
# Multipart form parsing
npm install multer sharp

# Type definitions
npm install --save-dev @types/multer

# Crypto/hashing (Node.js built-in, but confirm version)
# Built-in: crypto module for SHA256

# Image type detection
npm install file-type
```

---

## 🚀 Environment Variables

```env
# Already exists
IMAGE_MAX_DIMENSIONS=1024
CDN_BASE_URL=https://upqqejcbqstbfnrgiepu.supabase.co/storage/v1/object/public

# Add new
MAX_UPLOAD_SIZE_MB=10
PHOTO_VARIANTS=w256,w512,w1024,avif
SIGNED_URL_EXPIRY_SECONDS=86400  # 24 hours
```

---

## 📊 Risk Assessment

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|-----------|
| Path injection attacks | High | Low | Use UUID paths only |
| RLS policy bypass | High | Low | Test all policies |
| Storage quota exceeded | Medium | Medium | Cleanup job + monitoring |
| Image processing crashes | Medium | Medium | Error handling + retry logic |
| Concurrent upload duplicates | Low | Medium | SHA256 deduplication + DB constraint |
| CORS failures | Low | High | Test early with frontend |
| Signed URL expiry | Low | High | Set long expiry + regenerate on request |

---

## ✅ Success Criteria

1. Users can upload photos via POST `/v1/photos/upload`
2. Photos stored securely with UUID-based paths
3. Image variants generated automatically (w256, w512, w1024)
4. Signed URLs returned to frontend, valid for ≥24 hours
5. RLS policies enforce ownership (can't access other users' photos)
6. Photos deleted cleanly with storage cleanup
7. Edge function handles errors without orphaning records
8. No unauthorized access to private photos
9. Performance acceptable (<2s upload for 5MB file)
10. Documentation complete for developers

---

## 📝 Next Steps

1. **Confirm this plan** with you
2. **Start Phase 1**: Create storage buckets via Supabase API
3. **Implement backend** endpoint with full validation
4. **Test thoroughly** before connecting frontend
5. **Monitor** for issues in production (logs, errors, quota)

