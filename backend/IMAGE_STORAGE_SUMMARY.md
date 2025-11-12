# Image Storage Implementation - Executive Summary

## 🎯 Objective
Set up photo upload, storage, and retrieval for Photospots with security, reliability, and performance.

---

## 📊 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Expo)                         │
│                    (sends file + metadata)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND EXPRESS SERVER                      │
│  POST /v1/photos/upload                                        │
│  ├─ Auth check (requireAuth middleware)                        │
│  ├─ File validation (type, size, dimensions)                   │
│  ├─ Image analysis (SHA256, EXIF, dimensions)                  │
│  ├─ Create photo record in DB                                  │
│  └─ Upload to Supabase Storage (photos bucket)                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
          ┌──────────────────┐  ┌────────────────┐
          │  SUPABASE STORAGE│  │  POSTGRESQL DB │
          │  (2 buckets)     │  │  (photos table)│
          │                  │  │  (RLS policies)│
          │ photos/          │  │                │
          │ photo-variants/  │  │ - id (UUID)    │
          │                  │  │ - user_id      │
          │ Private/Public   │  │ - original_key │
          │ RLS enforced     │  │ - variants JSON│
          └────────┬─────────┘  │ - sha256       │
                   │             │ - visibility   │
                   │             └────────────────┘
                   │
                   ▼
          ┌──────────────────────┐
          │  EDGE FUNCTION       │
          │  on-photo-upload     │
          │  (Triggered)         │
          │                      │
          │ 1. Download original │
          │ 2. Generate variants │
          │    - w256, w512      │
          │    - w1024, avif     │
          │ 3. Upload variants   │
          │ 4. Update DB with    │
          │    signed URLs       │
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  FRONTEND DISPLAYS   │
          │  Images via signed   │
          │  URLs (24h expiry)   │
          └──────────────────────┘
```

---

## 🔐 Security Model

```
Storage Buckets:
├─ "photos" (PRIVATE)
│  ├─ Only owner can read/write
│  ├─ RLS enforced at storage level
│  └─ Path: {user_id}/{photo_id}/original.jpg
│
└─ "photo-variants" (PUBLIC)
   ├─ Public can read (via signed URLs)
   ├─ Only backend can write
   └─ Path: {user_id}/{photo_id}/w256.jpg (etc.)

Database:
├─ photos table has RLS policies:
│  ├─ SELECT: (visibility='public' OR auth.uid()=user_id)
│  ├─ INSERT/UPDATE/DELETE: auth.uid()=user_id only
│  └─ Enforced via PostgreSQL RLS
│
└─ User authentication:
   └─ requireAuth middleware validates JWT on upload
```

---

## ⚙️ Key Implementation Points

### Dependencies to Add
```bash
npm install multer sharp file-type
npm install --save-dev @types/multer
```

### Configuration (Already in .env)
```env
IMAGE_MAX_DIMENSIONS=1024
CDN_BASE_URL=https://upqqejcbqstbfnrgiepu.supabase.co/storage/v1/object/public
```

### New Environment Variables
```env
MAX_UPLOAD_SIZE_MB=10
PHOTO_VARIANTS=w256,w512,w1024,avif
SIGNED_URL_EXPIRY_SECONDS=86400  # 24 hours
```

---

## ⚠️ Top 5 Risks & How We Handle Them

| Risk | Mitigation | Impact |
|------|-----------|--------|
| **Path Injection** | Always use UUID paths, never user input | High (Security) |
| **RLS Bypass** | Test all policies thoroughly, validate auth | High (Security) |
| **Storage Quota** | Implement cleanup job, monitor usage | Medium (Availability) |
| **Image Processing Crashes** | Error handling in edge function, retry logic | Medium (Quality) |
| **Orphaned Records** | Transaction handling, cleanup job | Low (Data Integrity) |

---

## 📋 Implementation Phases

### Phase 1: Foundation (Storage Setup)
- Create `photos` and `photo-variants` buckets
- Set bucket permissions and CORS headers

### Phase 2: Backend Endpoint (Upload)
- Implement `POST /v1/photos/upload`
- Add multipart form parsing
- Validate files (type, size, dimensions)

### Phase 3: Image Processing
- Complete `on-photo-upload` edge function
- Generate variants (w256, w512, w1024, avif)

### Phase 4: Security (RLS)
- Configure bucket-level RLS policies
- Test with various auth scenarios

### Phase 5: Cleanup (Deletion)
- Implement `DELETE /v1/photos/{photoId}`
- Add orphan cleanup job

### Phase 6: Testing
- End-to-end upload/download
- Error scenarios
- Concurrent uploads

### Phase 7: Documentation
- Update GETTING_STARTED.md
- API endpoint docs

---

## 🚀 Expected Flow (Happy Path)

```
1. User picks image in frontend
   └─ Validates on frontend (type/size)

2. Sends to POST /v1/photos/upload
   ├─ Auth: JWT token in header
   ├─ Data: multipart form (file + spot_id + visibility)
   └─ Timeout: 30 seconds

3. Backend validates
   ├─ ✅ Auth check passed
   ├─ ✅ JPEG/PNG/WebP only
   ├─ ✅ <10MB size
   ├─ ✅ <4096x4096 dimensions
   └─ ✅ SHA256 calculated

4. Creates photo record
   ├─ INSERT into photos table
   ├─ Status: created
   └─ Returns: photo_id

5. Uploads to storage
   ├─ Stores to photos/{user_id}/{photo_id}/original
   ├─ Retention: permanent (until deleted)
   └─ Access: user_id only (RLS)

6. Triggers edge function
   ├─ Downloads original
   ├─ Resizes: w256 (128px), w512 (512px), w1024 (1024px)
   ├─ Converts: AVIF variant
   └─ Uploads to photo-variants/

7. Updates photo record
   ├─ Stores variant URLs in variants JSONB
   ├─ Sets processing_status: complete
   └─ Notifies frontend (optional: via polling)

8. Returns to frontend
   ├─ Returns: photo_id, variants (with signed URLs)
   ├─ URLs valid: 24 hours
   └─ Frontend stores variant URLs for display

9. Frontend displays
   ├─ Shows best variant for screen size
   ├─ On URL expiry: refetch from backend
   └─ User sees photo in spot details
```

---

## 🧪 Testing Strategy

```
Test Categories:
├─ File Validation
│  ├─ Valid: JPEG, PNG, WebP, GIF
│  ├─ Invalid: PDF, EXE, HTML, oversized, corrupt
│  └─ Edge: 0 bytes, 1 byte, exactly 10MB
│
├─ Image Dimensions
│  ├─ Valid: 100x100, 1920x1080, 4096x4096
│  ├─ Invalid: 4097x4097, 1x99999, 0x0
│  └─ Edge: non-square, portrait, landscape
│
├─ Concurrent Uploads
│  ├─ Same user 2 parallel uploads
│  ├─ Different users same image SHA256
│  └─ Race condition: duplicate SHA256 insert
│
├─ RLS & Auth
│  ├─ Unauthenticated: 401 Unauthorized
│  ├─ Authenticated: 200 Success
│  ├─ Can't read other users' photos
│  └─ Can't delete other users' photos
│
├─ Signed URLs
│  ├─ Valid URL accessible
│  ├─ Expired URL rejected
│  ├─ Wrong user: URL inaccessible
│  └─ Public variants: accessible without auth
│
└─ Cleanup
   ├─ Delete photo: removes from storage + DB
   ├─ Delete spot: cascades to photos
   └─ Orphan detection: finds unused records
```

---

## ✅ Success Criteria

- [x] Plan documented and reviewed
- [ ] Storage buckets created and tested
- [ ] Upload endpoint implemented and tested
- [ ] Image processing working (variants generated)
- [ ] RLS policies configured and tested
- [ ] Deletion logic implemented
- [ ] End-to-end flow working with frontend
- [ ] Error handling comprehensive
- [ ] Documentation updated
- [ ] No security vulnerabilities

---

## 🎯 Estimated Timeline

| Phase | Task | Estimated Time |
|-------|------|-----------------|
| 1 | Bucket setup | 15 min |
| 2 | Upload endpoint | 1 hour |
| 3 | Image processing | 30 min |
| 4 | RLS & security | 30 min |
| 5 | Deletion logic | 20 min |
| 6 | Testing | 1 hour |
| 7 | Documentation | 20 min |
| **TOTAL** | | **~4 hours** |

---

## 📞 Communication Plan

**If issues arise:**
1. Check IMAGE_STORAGE_PLAN.md for specific risk mitigations
2. Review logs in Supabase edge function dashboard
3. Test RLS policies in Supabase SQL editor
4. Verify bucket permissions in Storage settings
5. Check CORS headers if frontend can't access URLs

---

## 🔗 Reference Documents

- Full detailed plan: `IMAGE_STORAGE_PLAN.md`
- Database schema: `src/db/migrations/001_init.sql`
- Photo types: `src/types/photo.ts`
- Edge function: `edge-functions/on-photo-upload/index.ts`
- Routes: `src/api/routes/photos.ts`

