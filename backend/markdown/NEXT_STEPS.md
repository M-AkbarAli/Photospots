# Next Steps: From Seeding to User Discovery

**Current Status:** ✅ Data seeding complete - landmarks, hotspots, and photos are in the database

**Goal:** Enable users to discover photography hotspots and navigate to them

---

## Phase 1: API Endpoints for Frontend (Priority 1) 🎯

### 1. Get Hotspots for a Specific Landmark

**Endpoint:** `GET /v1/spots/:landmarkId/hotspots`

**Purpose:** When user taps "ROM" on the map, show them all the photography vantage points around it.

**Implementation:**
```typescript
router.get('/:landmarkId/hotspots', async (req, res): Promise<void> => {
  const { landmarkId } = req.params;
  
  // Query hotspots linked to this landmark
  // You'll need to either:
  // A) Use parent_spot_id if you added that column
  // B) Find spots with category='hotspot' near the landmark
  
  const { data: landmark } = await supabase
    .from('spots')
    .select('lat, lng, name')
    .eq('id', landmarkId)
    .single();
  
  if (!landmark) {
    res.status(404).json({ error: 'Landmark not found' });
    return;
  }
  
  // Find hotspots within 500m of landmark
  const { data: hotspots } = await supabase
    .rpc('api_spots_nearby', {
      lat: landmark.lat,
      lng: landmark.lng,
      radius_meters: 500,
    });
  
  // Filter to only hotspots (not other landmarks)
  const filteredHotspots = hotspots.filter(s => 
    s.categories?.includes('hotspot')
  );
  
  res.json({ success: true, hotspots: filteredHotspots });
});
```

### 2. Get Example Photos for a Hotspot

**Endpoint:** `GET /v1/spots/:hotspotId/photos`

**Purpose:** Show users example photos taken from this vantage point (the Flickr photos you seeded).

**Implementation:**
```typescript
router.get('/:hotspotId/photos', async (req, res): Promise<void> => {
  const { hotspotId } = req.params;
  
  const { data: photos, error } = await supabase
    .from('photos')
    .select('*')
    .eq('spot_id', hotspotId)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });
  
  if (error) {
    res.status(500).json({ error: 'Failed to fetch photos' });
    return;
  }
  
  res.json({ success: true, photos });
});
```

**Test with curl:**
```bash
# Get a landmark ID from your database
LANDMARK_ID="your-landmark-uuid"

# Fetch its hotspots
curl "http://localhost:3000/v1/spots/$LANDMARK_ID/hotspots"

# Get a hotspot ID from response
HOTSPOT_ID="hotspot-uuid"

# Fetch example photos
curl "http://localhost:3000/v1/spots/$HOTSPOT_ID/photos"
```

---

## Phase 2: Frontend Integration (Priority 2) 📱

### User Journey:
```
1. User opens app → See nearby landmarks on map
   ↓
2. User taps "ROM" landmark → See 3 hotspots around it
   ↓
3. User taps a hotspot → See example photos taken from that spot
   ↓
4. User clicks "Navigate Here" → Google/Apple Maps directions
   ↓
5. User arrives → Takes their own photo → Uploads it
```

### Frontend Code Example:

```typescript
// 1. Fetch nearby landmarks (you already have this endpoint)
const response = await fetch(
  `${API_URL}/v1/spots/nearby?lat=${lat}&lng=${lng}&radius=5000`
);
const { data: landmarks } = await response.json();

// 2. User taps a landmark - fetch its hotspots
const fetchHotspots = async (landmarkId: string) => {
  const response = await fetch(`${API_URL}/v1/spots/${landmarkId}/hotspots`);
  const { hotspots } = await response.json();
  return hotspots;
};

// 3. Display hotspots on map as smaller pins around the landmark

// 4. User taps a hotspot - fetch example photos
const fetchPhotos = async (hotspotId: string) => {
  const response = await fetch(`${API_URL}/v1/spots/${hotspotId}/photos`);
  const { photos } = await response.json();
  return photos;
};

// 5. Show photo carousel/gallery to user

// 6. "Navigate to Spot" button
const openMapsNavigation = (hotspot: Hotspot) => {
  const url = Platform.select({
    ios: `maps://app?daddr=${hotspot.lat},${hotspot.lng}`,
    android: `google.navigation:q=${hotspot.lat},${hotspot.lng}`,
  });
  Linking.openURL(url);
};
```

### UI Components Needed:
- **MapView** - Display landmarks and hotspots
- **LandmarkCard** - Show landmark info when tapped
- **HotspotList** - List of photography vantage points
- **PhotoCarousel** - Swipeable gallery of example photos
- **NavigateButton** - Opens native maps app

---

## Phase 3: Improve Data Relationships (Priority 3) 🔗

### Problem:
Right now, hotspots and landmarks are both stored in `spots` table, but there's no explicit link between them.

### Solution: Add Parent-Child Relationship

**Database Migration:**
```sql
-- Add columns to spots table
ALTER TABLE spots ADD COLUMN parent_spot_id UUID REFERENCES spots(id);
ALTER TABLE spots ADD COLUMN spot_type VARCHAR(20) DEFAULT 'landmark';

CREATE INDEX idx_spots_parent ON spots(parent_spot_id);
```

**Update Seed Script:**
When inserting hotspots, link them to their parent landmark:
```typescript
const { data: hotspot } = await supabase
  .from('spots')
  .insert({
    name: hotspotName,
    parent_spot_id: landmarkId, // 👈 Link to parent
    spot_type: 'hotspot',        // 👈 Mark as hotspot
    lat: hotspotLat,
    lng: hotspotLng,
    // ... rest of fields
  });
```

**Benefits:**
- Simpler queries: `SELECT * FROM spots WHERE parent_spot_id = 'landmark-id'`
- Better data integrity
- Easier to understand data model

---

## Phase 4: User-Generated Content (Priority 4) 📸

### Enable Community Contributions

**Photo Upload Endpoint:**
```typescript
POST /v1/spots/:spotId/photos
Content-Type: multipart/form-data
```

**Flow:**
1. User stands at a hotspot
2. Takes their own photo of the landmark
3. Uploads it to that hotspot
4. Other users see it in the example gallery

**Implementation:**
```typescript
router.post('/:spotId/photos', requireAuth, upload.single('photo'), async (req, res) => {
  const { spotId } = req.params;
  const userId = req.user.id;
  const file = req.file;
  
  // Upload to Supabase Storage
  const { data: upload } = await supabase.storage
    .from('photos')
    .upload(`${userId}/${Date.now()}.jpg`, file.buffer);
  
  // Create photo record
  const { data: photo } = await supabase
    .from('photos')
    .insert({
      spot_id: spotId,
      user_id: userId,
      storage_path: upload.path,
      visibility: 'public',
    });
  
  res.json({ success: true, photo });
});
```

**Benefits:**
- Creates a **community-driven** photography guide
- More diverse perspectives
- Fresh content over time
- User engagement

---

## Phase 5: Smart Features (Priority 5) 🧠

### A) Hotspot Ranking

Score hotspots based on multiple factors:
```typescript
interface HotspotScore {
  photoCount: number;        // More photos = better spot
  averageLikes: number;      // Higher quality photos
  timeOfDay: string;         // Golden hour photos score higher
  weatherConditions: string; // Clear skies = better
  userRatings: number;       // Direct user feedback
}
```

### B) Personalized Recommendations

```typescript
// Example: Time-based recommendations
const currentHour = new Date().getHours();
if (currentHour >= 17 && currentHour <= 19) {
  recommendedHotspot = hotspots.find(h => h.tags.includes('sunset'));
  message = "Perfect timing! This hotspot offers amazing sunset views.";
}
```

### C) Augmented Reality Preview

Show users what their photo will look like before they walk to the hotspot:
- Overlay example photo on camera view
- Show framing guide
- Indicate optimal position

### D) Route Optimization

```typescript
// Calculate optimal route through multiple hotspots
const optimizeRoute = (userLocation: Coords, hotspots: Hotspot[]) => {
  // Traveling salesman problem - visit all hotspots with minimum distance
  // Return ordered list of hotspots
};
```

**Benefits:**
- "Visit these 3 hotspots in this order to minimize walking distance"
- Time estimates for each segment
- Total walking distance

---

## Recommended Action Plan

### Today (30-45 minutes):
1. ✅ Add `GET /:landmarkId/hotspots` endpoint
2. ✅ Add `GET /:spotId/photos` endpoint
3. ✅ Test with curl commands
4. ✅ Verify data returns correctly

### This Week (4-6 hours):
1. 📱 Build map interface in frontend
2. 📱 Implement landmark tap → show hotspots
3. 📱 Implement hotspot tap → show photos
4. 📱 Add "Navigate" button
5. ✅ Test full user flow

### Next Week (3-4 hours):
1. 🔗 Add `parent_spot_id` and `spot_type` columns
2. 🔗 Update seed script to use new columns
3. 🔗 Refactor endpoints to use new relationship
4. ✅ Re-seed database with updated script

### Future Enhancements:
- 📸 User photo uploads (3-4 hours)
- 🧠 Hotspot ranking algorithm (2-3 hours)
- 🎯 Personalized recommendations (4-6 hours)
- 🌟 AR preview feature (8-12 hours)
- 🗺️ Route optimization (4-6 hours)

---

## Success Metrics

How you'll know it's working:

### Technical Metrics:
- ✅ API endpoints return data in <200ms
- ✅ 95%+ of landmarks have at least 2 hotspots
- ✅ Each hotspot has 3+ example photos
- ✅ Zero N+1 query problems

### User Metrics:
- ✅ Users tap on landmarks to explore hotspots
- ✅ Users view example photos before navigating
- ✅ Users successfully navigate to hotspots
- ✅ Users upload their own photos from hotspots

---

## Security Considerations

### Seed Endpoint:
- ⚠️ **Current issue:** Any authenticated user can trigger expensive seeding
- ✅ **Solution:** Add admin-only access or remove endpoint entirely
- ✅ **Recommendation:** Keep seeding as CLI script only for now

### Photo Uploads (Future):
- Rate limiting (max 10 uploads per hour per user)
- File size limits (max 10MB)
- Image validation (only JPEG/PNG)
- Moderation queue for new uploads

---

## Database Schema Reference

### Current Schema:
```sql
spots (
  id UUID PRIMARY KEY,
  name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  geom GEOMETRY(Point),
  categories TEXT[],
  source TEXT,
  score DOUBLE PRECISION,
  photo_url TEXT,
  description TEXT
)

photos (
  id UUID PRIMARY KEY,
  spot_id UUID REFERENCES spots(id),
  user_id UUID REFERENCES users(id),
  original_key TEXT,
  variants JSONB,
  visibility TEXT
)
```

### Recommended Addition:
```sql
ALTER TABLE spots ADD COLUMN parent_spot_id UUID REFERENCES spots(id);
ALTER TABLE spots ADD COLUMN spot_type VARCHAR(20) DEFAULT 'landmark';
CREATE INDEX idx_spots_parent ON spots(parent_spot_id);
```

---

## Summary: Your Roadmap

| Phase | Task | Time | Impact | Status |
|-------|------|------|--------|--------|
| ✅ **Phase 0** | Seed landmarks + hotspots | - | Foundation | Complete |
| 🎯 **Phase 1** | Add hotspots/photos endpoints | 30 min | Enable frontend | **Next** |
| 📱 **Phase 2** | Build frontend discovery flow | 4-6 hours | User value | Upcoming |
| 🔗 **Phase 3** | Add parent_spot_id linking | 30 min | Better queries | Soon |
| 📸 **Phase 4** | User photo uploads | 3-4 hours | Community content | Future |
| 🧠 **Phase 5** | Smart recommendations | Ongoing | Enhanced UX | Future |

---

## Notes

- Focus on getting the basic flow working end-to-end first
- Don't over-engineer early - ship and iterate
- User feedback will guide which smart features matter most
- Keep the seed endpoint commented out for security
- Test with real locations (Toronto, NYC, Paris) for best results
