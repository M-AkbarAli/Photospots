# Photospots - Comprehensive Technical Summary

**Project Overview**: Photospots is a mobile-first application that helps users discover photogenic locations and landmarks. The app opens directly to a full-screen map showing nearby photography spots with geolocation-based discovery. Users can explore curated photos from each location, navigate to exact photo spots, and contribute their own discoveries.

---

## Architecture Overview

### Tech Stack Summary

**Backend:**
- Framework: Spring Boot 3.3.2 (Java 21)
- Database: PostgreSQL 14 with PostGIS extension for geospatial queries
- Cache: Redis for performance optimization
- External APIs: Flickr API (for photo data seeding)
- Authentication: JWT-based (stateless)
- Build Tool: Maven
- Deployment: Containerized (Docker Compose for local dev)

**Frontend:**
- Framework: React Native with Expo SDK 54
- Navigation: Expo Router 6 (file-based routing)
- Maps: Mapbox via @rnmapbox/maps 10.1.44
- Location Services: expo-location 19
- Language: TypeScript 5.9
- State Management: React hooks (no external state management library yet)
- Build: Expo Development Builds (requires prebuild, not compatible with Expo Go)

---

## Backend Architecture (Spring Boot)

### Project Structure
```
backend-spring/
├── src/main/java/com/photospots/
│   ├── PhotospotsApplication.java          # Main entry point
│   ├── SeedPhotosRunner.java               # CLI tool for Flickr seeding
│   ├── config/                             # Configuration classes
│   │   ├── AppProperties.java              # Cache TTLs, rate limits, JWT
│   │   ├── AwsConfig.java                  # S3 configuration (planned)
│   │   ├── RedisConfig.java                # Redis cache manager
│   │   ├── RestClientConfig.java           # RestTemplate bean
│   │   └── SecurityConfig.java             # Spring Security + JWT
│   ├── controller/                         # REST endpoints
│   │   ├── AuthController.java             # /v1/auth/*
│   │   └── SpotController.java             # /v1/spots/*
│   ├── dto/                                # Data Transfer Objects
│   │   ├── ApiResponse.java                # Standard response wrapper
│   │   ├── PhotoDto.java                   # Photo response
│   │   ├── SpotDto.java                    # Spot response
│   │   └── UserDto.java                    # User response
│   ├── exception/
│   │   └── ApiExceptionHandler.java        # Global error handling
│   ├── filter/
│   │   └── RateLimitFilter.java            # IP-based rate limiting (429)
│   ├── model/                              # JPA entities
│   │   ├── Photo.java                      # photos table entity
│   │   └── Spot.java                       # spots table entity
│   ├── repository/
│   │   └── SpotRepository.java             # Spring Data JPA
│   ├── security/
│   │   ├── JwtAuthenticationFilter.java    # JWT validation filter
│   │   └── JwtTokenProvider.java           # JWT parsing/validation
│   ├── service/                            # Business logic
│   │   ├── CacheService.java               # Redis wrapper
│   │   ├── FlickrSeedService.java          # Flickr API integration (1595 lines)
│   │   └── SpotService.java                # Core business logic
│   └── util/
│       └── GeoValidator.java               # Coordinate validation
└── src/main/resources/
    ├── application.yml                     # Spring configuration
    └── db/migration/                       # Flyway migrations
        ├── V1__Initial_Schema.sql          # Base schema + PostGIS
        └── V2__photos_geo_and_integrity.sql # Photo geo columns
```

### Database Schema

#### Spots Table
```sql
CREATE TABLE spots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    categories TEXT[],                      -- Array of categories (e.g., "hotspot", "landmark")
    lat DOUBLE PRECISION,                   -- Latitude (denormalized)
    lng DOUBLE PRECISION,                   -- Longitude (denormalized)
    geom GEOMETRY(Point, 4326),             -- PostGIS geometry for spatial queries
    score DOUBLE PRECISION,                 -- Relevance/quality score
    photo_url TEXT,                         -- Primary photo URL
    source VARCHAR(50),                     -- Data source (e.g., "flickr", "user")
    source_id TEXT,                         -- External source identifier
    parent_spot_id UUID,                    -- For hotspot->landmark relationships
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (parent_spot_id) REFERENCES spots(id) ON DELETE CASCADE
);

CREATE INDEX idx_spots_geom ON spots USING GIST (geom);
```

#### Photos Table
```sql
CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spot_id UUID NOT NULL,                  -- Reference to spot
    original_key VARCHAR(255) UNIQUE NOT NULL, -- S3 key or external URL
    variants JSONB,                         -- Image variants/metadata
    visibility VARCHAR(50) DEFAULT 'public',
    lat DOUBLE PRECISION,                   -- Photo-specific location
    lng DOUBLE PRECISION,
    geom GEOMETRY(Point, 4326),
    created_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
);

CREATE INDEX idx_photos_spot_id ON photos(spot_id);
CREATE INDEX photos_geom_gix ON photos USING GIST (geom);
```

**Key Schema Notes:**
- PostGIS extension enables spatial queries (radius search, distance calculations)
- Categories array allows spots to be both "landmark" and "hotspot"
- Parent-child relationship: hotspots reference landmarks via `parent_spot_id`
- Photos have their own geolocation (not just inherited from spot)
- JSONB variants field stores multiple image sizes, metadata from Flickr

### REST API Endpoints

#### Public Endpoints (No Auth Required)

**GET /v1/spots/nearby**
```
Query Parameters:
  - lat: double (required) - User latitude
  - lng: double (required) - User longitude  
  - radiusMeters: double (default 1500, range: 100-50000)

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "CN Tower",
      "description": "Iconic Toronto landmark...",
      "categories": ["landmark"],
      "latitude": 43.6426,
      "longitude": -79.3871,
      "score": 95.5,
      "photoUrl": "https://...",
      "distanceMeters": 250.5
    }
  ],
  "count": 15
}

Backend Logic:
- Validates coordinates (-90 to 90 lat, -180 to 180 lng)
- Uses PostGIS ST_DWithin for efficient spatial query
- Results cached in Redis for 300 seconds (5 min)
- Returns max 200 results, sorted by score and distance
```

**GET /v1/spots/search**
```
Query Parameters:
  - q: string (required, min 2 chars) - Search query
  - lat: double (optional) - For distance-based sorting
  - lng: double (optional) - Must provide both or neither

Response: Same as nearby endpoint

Backend Logic:
- Full-text search on name, description fields
- Uses PostgreSQL trigram similarity or text search
- If coordinates provided, sorts by relevance + distance
- Cached for 180 seconds (3 min)
- Max 50 results
```

**GET /v1/spots/{id}**
```
Path Parameter:
  - id: UUID

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "...",
    "description": "...",
    "categories": [...],
    "latitude": 43.6426,
    "longitude": -79.3871,
    "score": 95.5,
    "photoUrl": "https://..."
  }
}

Backend Logic:
- Direct lookup by UUID
- Cached for 600 seconds (10 min)
- Returns 404 if not found
```

**GET /v1/spots/{landmarkId}/hotspots**
```
Path Parameter:
  - landmarkId: UUID

Response: Array of spots (similar to nearby)

Backend Logic:
- Finds spots within 500m of the landmark
- Filters to only include spots with "hotspot" category
- Excludes the landmark itself from results
- Used to find photo spots around major landmarks
- Cached for 300 seconds (5 min)
```

**GET /v1/spots/{spotId}/photos**
```
Path Parameter:
  - spotId: UUID

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "spotId": "uuid",
      "variants": {
        "latitude": 43.6426,
        "longitude": -79.3871,
        "url_l": "https://live.staticflickr.com/...",
        "url_o": "https://...",
        "width": 1024,
        "height": 768
      },
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 12
}

Backend Logic:
- Returns all public photos for a spot
- Sorted by created_at DESC (newest first)
- Cached for 600 seconds (10 min)
```

#### Protected Endpoints (JWT Required)

**POST /v1/spots**
```
Headers:
  Authorization: Bearer <jwt_token>

Request Body:
{
  "name": "Secret Garden Viewpoint",
  "description": "Amazing view of the city",
  "categories": ["hotspot"],
  "latitude": 43.6532,
  "longitude": -79.3832,
  "score": 80.0
}

Response:
{
  "success": true,
  "data": { /* created spot */ }
}

Backend Logic:
- Validates JWT token
- Validates coordinates
- Creates PostGIS Point geometry
- Sets source to "user"
- Returns 401 if token invalid/missing
```

**GET /v1/auth/me**
```
Headers:
  Authorization: Bearer <jwt_token>

Response:
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "user@example.com"
  }
}

Backend Logic:
- Extracts user from JWT claims
- Returns user profile data
- Used to verify authentication status
```

### Security & Rate Limiting

**JWT Authentication:**
- Stateless JWT tokens (no session storage)
- Secret key configured in `app.jwt.secret`
- Token contains: subject (userId), email, expiry
- Access tokens valid for 3600 seconds (1 hour)
- Refresh tokens valid for 1209600 seconds (14 days)

**Rate Limiting:**
- IP-based rate limiting via `RateLimitFilter`
- 100 requests per 15-minute window (per IP)
- Returns 429 Too Many Requests when exceeded
- Implemented with Redis counter (sliding window)

**Security Configuration:**
```java
// Public endpoints
.requestMatchers("/actuator/health", "/actuator/info").permitAll()
.requestMatchers("/v1/auth/**", "/v1/spots/nearby", 
                 "/v1/spots/search", "/v1/spots/**").permitAll()

// Protected endpoints
.requestMatchers("POST", "/v1/spots").authenticated()
.requestMatchers("/v1/auth/me").authenticated()
```

### Caching Strategy

**Redis Cache TTLs:**
- Nearby queries: 300 seconds (5 min)
- Search queries: 180 seconds (3 min)
- Spot details: 600 seconds (10 min)
- Hotspots: 300 seconds (5 min)
- Photos: 600 seconds (10 min)

**Cache Key Patterns:**
```
nearby:43.65:-79.38:1500         # Rounded to 2 decimals + radius
search:cn tower:436:-793         # Query + optional rounded coords
spot:uuid                        # Direct spot lookup
hotspots:uuid                    # Hotspots for landmark
photos:uuid                      # Photos for spot
```

**Cache Invalidation:**
- Currently manual (planned: on create/update/delete)
- Cache service provides get/set/delete operations
- Uses Jackson for JSON serialization

### Flickr Seeding Pipeline

The `FlickrSeedService` is a sophisticated system for populating the database with high-quality photos:

**Key Features:**
1. **Multi-Strategy Photo Discovery:**
   - Searches by place name (text queries)
   - Geographic radius searches (lat/lng + radius)
   - Flickr groups (e.g., Toronto photography group)
   - Sorts by both relevance AND interestingness

2. **Quality Filtering:**
   - Removes duplicates (by Flickr photo ID)
   - Filters out portrait photos (face detection via Python script)
   - Filters out blurry images (blur score threshold)
   - Requires minimum resolution (800+ pixels)
   - Geo-validation (photos must have valid coordinates)

3. **Landmark-Hotspot Hierarchy:**
   - Creates "landmark" spots for major locations (CN Tower, Nathan Phillips Square)
   - Creates "hotspot" spots for good photo viewpoints near landmarks
   - Hotspots reference parent landmark via `parent_spot_id`

4. **Photo Quality Assessment:**
   - Uses Python script `tools/photo_filter/filter_photos.py`
   - Leverages Google Cloud Vision API for:
     - Face detection (reject if face > 15% of image)
     - Blur detection (reject if blur score > threshold)
   - Fallback mode if Vision API unavailable

5. **Data Sources:**
   - Reads `src/main/resources/seed/areas.json` for regions to seed
   - Reads `src/main/resources/seed/locations.json` for specific landmarks
   - Example location format:
   ```json
   {
     "name": "CN Tower",
     "city": "Toronto",
     "lat": 43.6426,
     "lng": -79.3871,
     "categories": ["landmark"],
     "searchTerms": ["CN Tower", "Toronto Tower"],
     "radius": 500
   }
   ```

6. **Execution:**
   - Run via command line: `java -jar target/photospots-backend.jar seed`
   - Respects Flickr API limits (3600 requests/hour)
   - Provides detailed statistics (photos fetched, filtered, inserted)
   - Configurable via `flickr.api-key` and `flickr.api-secret`

---

## Frontend Architecture (React Native + Expo)

### Project Structure
```
frontend/
├── src/
│   ├── app/                                # Expo Router file-based routing
│   │   ├── _layout.tsx                     # Root layout with navigation
│   │   ├── +html.tsx                       # Web HTML template
│   │   ├── +not-found.tsx                  # 404 page
│   │   ├── modal.tsx                       # Modal screen
│   │   └── (tabs)/                         # Tab-based navigation group
│   │       ├── _layout.tsx                 # Tab bar configuration
│   │       ├── index.tsx                   # Main map screen
│   │       └── two.tsx                     # Second tab (placeholder)
│   ├── components/                         # Reusable components
│   │   ├── Map.tsx                         # Map component (empty placeholder)
│   │   ├── Themed.tsx                      # Themed Text/View components
│   │   ├── useColorScheme.ts               # Dark/light mode hook
│   │   └── ...
│   ├── constants/
│   │   └── Colors.ts                       # Theme colors
│   └── lib/                                # Utilities (empty currently)
├── assets/                                 # Static assets
│   ├── fonts/
│   └── images/
├── android/                                # Native Android code
├── ios/                                    # Native iOS code
├── .env                                    # Environment variables
├── app.json                                # Expo configuration
├── package.json                            # Dependencies
└── tsconfig.json                           # TypeScript config
```

### Current Implementation Status

**Completed:**
1. **Basic Navigation Setup:**
   - Expo Router configured with tab-based navigation
   - Two tab screens (index = map, two = placeholder)
   - Modal route for future use
   - Dark/light theme support via @react-navigation/native

2. **Map Integration:**
   - Mapbox Maps SDK integrated via @rnmapbox/maps
   - Location permissions handling (expo-location)
   - Map centers on user location on first load
   - Fallback to Toronto coordinates if permission denied
   - Full-screen map on index screen

3. **Development Environment:**
   - Expo SDK 54 with React 19.1
   - TypeScript configured
   - Native build setup (iOS/Android)
   - Environment variable support via dotenv

**Current Map Screen (`src/app/(tabs)/index.tsx`):**
```tsx
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.demo_token');

export default function TabOneScreen() {
  const [centerCoordinate, setCenterCoordinate] = useState<number[] | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) {
            Alert.alert('Location permission', 'Location permission was not granted...');
            setCenterCoordinate([-79.3832, 43.6532]); // Toronto fallback
          }
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ 
          accuracy: Location.Accuracy.Highest 
        });
        if (mounted && loc?.coords) {
          setCenterCoordinate([loc.coords.longitude, loc.coords.latitude]);
        }
      } catch (err) {
        console.warn('Failed to get location', err);
        if (mounted) setCenterCoordinate([-79.3832, 43.6532]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera
          centerCoordinate={centerCoordinate ?? [-79.3832, 43.6532]}
          zoomLevel={13}
        />
      </Mapbox.MapView>
    </View>
  );
}
```

**Not Yet Implemented (Frontend Needs):**

1. **Backend Integration:**
   - No API client/service layer yet
   - Need to call `/v1/spots/nearby` with user location
   - Need to call `/v1/spots/{id}` for spot details
   - Need to call `/v1/spots/{spotId}/photos` for photo gallery
   - Need error handling and loading states

2. **Map Features:**
   - No markers/pins for spots yet
   - No clustering for dense spot areas
   - No marker tap handling
   - No custom marker icons
   - No re-querying when map moves/zooms

3. **Spot Detail UI:**
   - No bottom sheet/modal for spot details
   - No photo gallery view
   - No navigation to photo location
   - No save/favorite functionality

4. **Authentication:**
   - No JWT token storage
   - No login/signup flow
   - No user profile screen
   - No protected actions (create spot)

5. **State Management:**
   - No centralized state (using local component state only)
   - No caching of fetched spots
   - Consider React Context or Zustand for global state

6. **User Experience:**
   - No loading indicators
   - No offline handling
   - No error messages for API failures
   - No search bar for spot search
   - No list view alternative to map

### Environment Variables

**Backend (.env):**
```bash
# Database
POSTGRES_URL=postgresql://user:pass@host:5432/photospots
POSTGRES_USER=photospots
POSTGRES_PASSWORD=photospots

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key-here

# Flickr (for seeding)
FLICKR_API_KEY=your-flickr-key
FLICKR_API_SECRET=your-flickr-secret

# AWS (planned)
AWS_REGION=us-east-1
AWS_S3_BUCKET=photospots-uploads
```

**Frontend (.env):**
```bash
# Mapbox (required)
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_token_here
MAPBOX_DOWNLOAD_TOKEN=sk.your_download_token_here

# Backend API (not configured yet)
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080

# Future: JWT token storage key
```

---

## Development Workflow

### Backend Development

**Local Setup:**
```bash
# Start PostgreSQL + Redis
cd backend-spring
docker-compose up -d

# Run Spring Boot (port 8080)
./run-dev.sh
# OR
mvn spring-boot:run

# Run Flickr seeding
java -jar target/photospots-backend-0.0.1-SNAPSHOT.jar seed
```

**Key Files to Edit:**
- Controllers: `src/main/java/com/photospots/controller/`
- Business logic: `src/main/java/com/photospots/service/`
- Database migrations: `src/main/resources/db/migration/`
- Config: `src/main/resources/application.yml`

**Database Migrations:**
- Uses Flyway (auto-runs on startup)
- Versioned SQL files: `V1__description.sql`, `V2__description.sql`, etc.
- Never modify existing migrations (create new ones)

### Frontend Development

**Local Setup:**
```bash
cd frontend

# Install dependencies
npm install

# Configure Mapbox tokens in .env

# Generate native code (required for @rnmapbox/maps)
npx expo prebuild

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android

# Development server (for web/metro)
npx expo start
```

**Important Notes:**
- Cannot use Expo Go (due to native Mapbox dependency)
- Must use development builds or run on device/simulator
- Changes to native code require rebuild (npx expo prebuild)
- Changes to JS/TS hot reload automatically

**Key Files to Edit:**
- Screens: `src/app/(tabs)/index.tsx`, etc.
- Components: `src/components/`
- API client (to create): `src/lib/api.ts` or similar
- Types (to create): `src/types/` for backend DTOs

---

## Data Flow & Integration Points

### Typical User Journey

1. **App Launch:**
   - User opens app → sees map screen
   - App requests location permission
   - If granted: centers on user, shows loading
   - Frontend calls: `GET /v1/spots/nearby?lat=43.65&lng=-79.38&radiusMeters=1500`
   - Backend queries PostGIS, returns spots from cache/DB
   - Frontend displays markers on map

2. **Marker Tap:**
   - User taps marker → shows spot detail bottom sheet
   - Frontend calls: `GET /v1/spots/{id}` for full details
   - Displays name, description, thumbnail, distance
   - "View Photos" button calls: `GET /v1/spots/{spotId}/photos`
   - Shows photo gallery with exact coordinates

3. **Photo Selection:**
   - User taps photo → displays full screen
   - Shows "Navigate Here" button with photo's lat/lng
   - Can open in Maps app or show route on Mapbox

4. **Search:**
   - User types in search bar (not implemented yet)
   - Frontend calls: `GET /v1/spots/search?q=cn+tower&lat=43.65&lng=-79.38`
   - Results displayed as list or map markers

5. **Create Spot (Future):**
   - User long-presses map → "Add Spot Here"
   - Shows form (name, description, category)
   - Frontend calls: `POST /v1/spots` with JWT token
   - Requires authentication flow (not implemented)

### API Integration Guide

**Recommended Frontend API Client Structure:**

```typescript
// src/lib/api.ts
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8080';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  count?: number;
  error?: string;
  message?: string;
}

interface Spot {
  id: string;
  name: string;
  description: string;
  categories: string[];
  latitude: number;
  longitude: number;
  score: number;
  photoUrl?: string;
  distanceMeters?: number;
}

interface Photo {
  id: string;
  spotId: string;
  variants: {
    latitude: number;
    longitude: number;
    url_l: string;
    url_o?: string;
    width: number;
    height: number;
  };
  createdAt: string;
}

export const api = {
  async getNearbySpots(lat: number, lng: number, radiusMeters: number = 1500): Promise<Spot[]> {
    const response = await fetch(
      `${API_BASE_URL}/v1/spots/nearby?lat=${lat}&lng=${lng}&radiusMeters=${radiusMeters}`
    );
    const json: ApiResponse<Spot[]> = await response.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch spots');
    return json.data;
  },

  async getSpotById(id: string): Promise<Spot> {
    const response = await fetch(`${API_BASE_URL}/v1/spots/${id}`);
    const json: ApiResponse<Spot> = await response.json();
    if (!json.success) throw new Error(json.error || 'Spot not found');
    return json.data;
  },

  async getSpotPhotos(spotId: string): Promise<Photo[]> {
    const response = await fetch(`${API_BASE_URL}/v1/spots/${spotId}/photos`);
    const json: ApiResponse<Photo[]> = await response.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch photos');
    return json.data;
  },

  async searchSpots(query: string, lat?: number, lng?: number): Promise<Spot[]> {
    const params = new URLSearchParams({ q: query });
    if (lat !== undefined && lng !== undefined) {
      params.append('lat', lat.toString());
      params.append('lng', lng.toString());
    }
    const response = await fetch(`${API_BASE_URL}/v1/spots/search?${params}`);
    const json: ApiResponse<Spot[]> = await response.json();
    if (!json.success) throw new Error(json.error || 'Search failed');
    return json.data;
  },

  async createSpot(spot: Omit<Spot, 'id'>, token: string): Promise<Spot> {
    const response = await fetch(`${API_BASE_URL}/v1/spots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(spot),
    });
    const json: ApiResponse<Spot> = await response.json();
    if (!json.success) throw new Error(json.error || 'Failed to create spot');
    return json.data;
  },
};
```

---

## Key Technical Decisions & Rationale

1. **PostGIS for Geospatial:**
   - Native spatial indexing (GIST) for fast radius queries
   - ST_DWithin avoids expensive haversine calculations
   - Industry standard for location-based apps

2. **Redis Caching:**
   - Reduces DB load for frequent nearby/search queries
   - TTLs balance freshness vs performance
   - Simple key-value model (no complex invalidation yet)

3. **JWT Authentication:**
   - Stateless (no session storage on backend)
   - Scales horizontally (any server can validate)
   - Standard for mobile apps (token in AsyncStorage)

4. **Flickr for Photo Data:**
   - Massive public photo dataset with geo-coordinates
   - Interestingness algorithm surfaces quality content
   - Free API tier sufficient for seeding
   - Alternative: eventually user-generated content

5. **Expo + Mapbox:**
   - Expo provides fast mobile development with native access
   - Mapbox offers superior customization vs Google Maps
   - @rnmapbox/maps has better performance than react-native-maps
   - Tradeoff: requires dev builds (no Expo Go)

6. **Map-First UX:**
   - Users discover visually vs list/search
   - More engaging for exploration use case
   - Common pattern for location apps (Airbnb, Yelp)

---

## Next Steps & Priorities

### Immediate Backend Tasks
- [ ] Add database seeding for demo locations (Toronto, NYC, LA)
- [ ] Implement S3 integration for user-uploaded photos
- [ ] Add user table and registration endpoints
- [ ] Implement favorite/saved spots functionality
- [ ] Add pagination to photo/spot endpoints
- [ ] Improve search relevance (full-text search rankings)

### Immediate Frontend Tasks (HIGH PRIORITY)
- [ ] **Create API client module** (`src/lib/api.ts`)
- [ ] **Fetch and display spot markers on map**
  - Call `/v1/spots/nearby` when map loads
  - Show Mapbox markers for each spot
  - Implement marker clustering for dense areas
- [ ] **Spot detail bottom sheet**
  - Show on marker tap
  - Display spot info (name, description, distance)
  - "View Photos" button
- [ ] **Photo gallery screen**
  - Swipeable full-screen images
  - Show photo location on mini-map
  - "Navigate to Photo Spot" button
- [ ] **Handle loading/error states**
  - Spinner while fetching
  - Error messages with retry
- [ ] **Re-query on map movement**
  - Fetch new spots when user pans/zooms
  - Debounce to avoid excessive API calls

### Medium-Term Features
- [ ] Search bar with autocomplete
- [ ] List view toggle (map ↔ list)
- [ ] Authentication flow (login/signup)
- [ ] User profile with saved spots
- [ ] Add spot flow (long-press map)
- [ ] Upload photo to spot
- [ ] Share spot/photo functionality
- [ ] Offline mode with cached data

### Long-Term Ideas
- [ ] AR view to find photo spots
- [ ] Social features (follow, comments)
- [ ] Trip planning (save route of spots)
- [ ] User reputation/badges
- [ ] Monetization (premium spots, ads)

---

## Common Issues & Troubleshooting

### Backend Issues

**"PostGIS extension not found":**
```bash
# Connect to PostgreSQL
psql -U photospots -d photospots

# Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
```

**"Redis connection refused":**
```bash
# Start Redis
docker-compose up redis -d

# Or install locally
brew install redis
redis-server
```

**Flyway migration fails:**
```bash
# Check migration status
mvn flyway:info

# Repair if needed (dangerous!)
mvn flyway:repair

# Clean and rebuild (DROPS ALL DATA!)
mvn flyway:clean && mvn flyway:migrate
```

### Frontend Issues

**"@rnmapbox/maps" native module not found:**
```bash
# Must prebuild (generates native code)
npx expo prebuild --clean

# Then rebuild
npx expo run:ios
# or
npx expo run:android
```

**Mapbox token errors:**
- Ensure `.env` file exists in frontend root
- Token must start with `pk.` (public) or `sk.` (download)
- Restart Metro bundler after changing .env
- For iOS: may need to rebuild native project

**Location permissions not working:**
- iOS: Check `Info.plist` has location permission strings
- Android: Check `AndroidManifest.xml` has permissions
- Simulator: use Debug → Location in Xcode

---

## Performance Considerations

### Backend
- Database connections pooled (HikariCP default: 10 connections)
- Redis cache hit rate should be 70%+ for production
- PostGIS spatial index essential (created in V1 migration)
- Consider read replicas if traffic increases
- Rate limiting prevents abuse (100 req/15min per IP)

### Frontend
- Marker clustering critical above 50-100 markers
- Debounce map movement (wait 300ms after pan stops)
- Image caching for spot thumbnails (react-native-fast-image)
- Lazy load photos (only fetch when detail sheet opens)
- Use React.memo for marker components
- Consider virtual list for photo gallery

---

## Testing Strategy (To Be Implemented)

### Backend Tests Needed
- Unit tests for SpotService (nearby, search logic)
- Integration tests for REST endpoints
- PostGIS query tests with test data
- JWT validation tests
- Rate limiting tests

### Frontend Tests Needed
- Unit tests for API client
- Component tests for Map, SpotDetail
- Integration tests for user flows
- Location permission mocking
- API error handling tests

---

## Deployment (Not Yet Configured)

### Backend Deployment Options
- Railway (easiest, PostgreSQL + Redis included)
- Render (free PostgreSQL, separate Redis)
- AWS ECS + RDS + ElastiCache
- Heroku (simple but expensive)

**Required Environment Variables:**
- Database URL, user, password
- Redis URL
- JWT secret (generate strong random string)
- Flickr API keys (if seeding in prod)

### Frontend Deployment
- EAS Build for app store distribution
- Expo Updates for OTA updates
- TestFlight for iOS beta testing
- Internal testing for Android

---

## Additional Resources

### Documentation
- Spring Boot: https://spring.io/projects/spring-boot
- PostGIS: https://postgis.net/docs/
- Expo: https://docs.expo.dev/
- Mapbox React Native: https://github.com/rnmapbox/maps
- Flickr API: https://www.flickr.com/services/api/

### Similar Apps (For Inspiration)
- Atlas Obscura: discovery-focused, rich content
- AllTrails: map-first, user-generated content
- Instagram Location Tags: social + discovery
- Google Maps Local Guides: gamification

---

## Summary for ChatGPT Context

**Project**: Photospots is a mobile app (React Native + Expo) backed by a Spring Boot REST API that helps users discover and navigate to photogenic locations. The backend uses PostgreSQL + PostGIS for geospatial queries and Flickr API for seeding photo data. The frontend currently has basic Mapbox integration with user location but needs API integration to display markers, handle spot details, and show photo galleries.

**Current State**: Backend is fully functional with 6 REST endpoints (nearby, search, spot details, hotspots, photos, create spot), JWT auth, Redis caching, and a sophisticated Flickr seeding pipeline. Frontend has map rendering and location permission but no backend integration yet—this is the immediate priority.

**Technical Stack**: Java 21 + Spring Boot 3 + PostgreSQL 14 + PostGIS + Redis on backend; TypeScript + React Native + Expo 54 + Mapbox on frontend. File-based routing with Expo Router. No state management library yet (using React hooks).

**Immediate Goal**: Integrate backend API into frontend—create API client, fetch and display markers, build spot detail UI, show photo galleries. Focus on map-based discovery flow: user opens app → sees nearby spots on map → taps marker → views details/photos → navigates to photo location.

Use this document to understand the complete technical architecture when helping with frontend development, API integration, state management decisions, and feature implementation planning.
