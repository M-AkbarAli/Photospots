# Photospots Frontend Architecture

> **Purpose**: This document provides a comprehensive technical reference for the React Native / Expo frontend. Use this as context for ChatGPT or other AI assistants to ensure accurate brainstorming and code generation.

---

## 1. Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.1.0 | UI library |
| React Native | 0.81.4 | Mobile framework |
| Expo SDK | 54 | Development platform |
| Expo Router | 6.0.7 | File-based navigation |
| TypeScript | 5.8.3 | Type safety |
| @rnmapbox/maps | 10.1.44 | Mapbox integration |
| @gorhom/bottom-sheet | 5.2.8 | Bottom sheet component |
| expo-location | 19.0.7 | Location services |
| @react-native-async-storage/async-storage | 2.2.0 | Local persistence |
| react-native-gesture-handler | 2.30.0 | Gesture handling |
| react-native-reanimated | 4.1.0 | Animations |

**Key Config**: `newArchEnabled: true` (React Native New Architecture enabled)

---

## 2. Project Structure

```
frontend/
├── app.json                 # Expo configuration (plugins, permissions, bundle IDs)
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config (strict mode, path aliases)
├── expo-env.d.ts            # Expo type declarations
│
├── src/
│   ├── app/                 # Expo Router file-based routes
│   │   ├── _layout.tsx      # Root layout (Stack navigator + providers)
│   │   ├── +html.tsx        # Web HTML template (if applicable)
│   │   ├── +not-found.tsx   # 404 screen
│   │   ├── modal.tsx        # Modal route (placeholder)
│   │   ├── search.tsx       # Text search screen
│   │   ├── (tabs)/          # Tab navigator group
│   │   │   ├── _layout.tsx  # Tab bar configuration
│   │   │   ├── index.tsx    # Main map screen (Explore tab)
│   │   │   └── two.tsx      # Saved tab (placeholder)
│   │   ├── navigation/      # Navigation helpers (if any)
│   │   └── photo-gallery/
│   │       └── [spotId].tsx # Dynamic photo gallery route
│   │
│   ├── components/
│   │   ├── Map/
│   │   │   ├── SpotLayers.tsx         # Mapbox markers + clustering
│   │   │   ├── SearchPill.tsx         # Top search bar pill
│   │   │   └── SearchThisAreaPill.tsx # "Search this area" floating pill
│   │   ├── Spot/
│   │   │   ├── SpotBottomSheet.tsx    # Spot detail bottom sheet
│   │   │   └── CategoryChips.tsx      # Category tag chips
│   │   ├── Themed.tsx                 # Theme-aware Text/View components
│   │   ├── EditScreenInfo.tsx         # Dev info component (boilerplate)
│   │   └── ...                        # Other utility components
│   │
│   ├── constants/
│   │   ├── theme.ts         # THEME color constants
│   │   └── Colors.ts        # Legacy/additional colors
│   │
│   ├── lib/
│   │   ├── api.ts           # API client (fetch wrapper)
│   │   ├── storage.ts       # AsyncStorage helpers
│   │   └── geo.ts           # Haversine distance calculations
│   │
│   └── types/
│       └── api.ts           # TypeScript interfaces (Spot, Photo, etc.)
```

---

## 3. Navigation Structure (Expo Router)

### Root Layout (`src/app/_layout.tsx`)
```tsx
// Wraps entire app with:
// - GestureHandlerRootView (required for bottom sheets/gestures)
// - ThemeProvider (React Navigation theming)
// - Stack Navigator

<Stack>
  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
  <Stack.Screen name="search" options={{ presentation: 'modal', headerShown: false }} />
  <Stack.Screen name="photo-gallery/[spotId]" options={{ headerShown: false }} />
</Stack>
```

### Tab Navigator (`src/app/(tabs)/_layout.tsx`)
```tsx
<Tabs>
  <Tabs.Screen 
    name="index"  // Maps to (tabs)/index.tsx
    options={{ 
      title: 'Explore', 
      tabBarIcon: map-outline,
      headerShown: false 
    }} 
  />
  <Tabs.Screen 
    name="two"    // Maps to (tabs)/two.tsx
    options={{ 
      title: 'Saved', 
      tabBarIcon: heart-outline 
    }} 
  />
</Tabs>
```

### Route Summary
| Route | File | Description |
|-------|------|-------------|
| `/` | `(tabs)/index.tsx` | Main map screen |
| `/two` | `(tabs)/two.tsx` | Saved spots (placeholder) |
| `/search` | `search.tsx` | Text search modal |
| `/photo-gallery/[spotId]` | `photo-gallery/[spotId].tsx` | Full-screen photo gallery |
| `/modal` | `modal.tsx` | Generic modal (unused) |

---

## 4. Core Screens

### 4.1 Main Map Screen (`src/app/(tabs)/index.tsx`)

**Size**: ~432 lines  
**Primary purpose**: Interactive map with spot markers

**Key State**:
```tsx
// Location
const [userCoordinates, setUserCoordinates] = useState<[number, number] | null>(null);
const [mapCenter, setMapCenter] = useState<[number, number]>(TORONTO_COORDS);
const [locationDenied, setLocationDenied] = useState(false);

// Spots
const [spots, setSpots] = useState<Spot[]>([]);
const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
const [lastFetchedCenter, setLastFetchedCenterState] = useState<[number, number] | null>(null);

// UI
const [showSearchPill, setShowSearchPill] = useState(false);
const [isSearching, setIsSearching] = useState(false);
const [isInitialized, setIsInitialized] = useState(false);
```

**Key Refs**:
```tsx
const cameraRef = useRef<Mapbox.Camera>(null);
const spotLayersRef = useRef<SpotLayersRef>(null);
const bottomSheetRef = useRef<BottomSheet>(null);
```

**Initialization Flow**:
1. Request foreground location permission via `expo-location`
2. Get current position with 5s timeout
3. Fallback to Toronto coords `[-79.3832, 43.6532]` if denied/timeout
4. Check `AsyncStorage` for `hasFetchedOnce`
5. Auto-fetch spots on first-ever app launch only

**Map Configuration**:
```tsx
<Mapbox.MapView styleURL={Mapbox.StyleURL.Street}>
  <Mapbox.Camera
    ref={cameraRef}
    defaultSettings={{
      centerCoordinate: mapCenter,
      zoomLevel: 13,
    }}
  />
  <SpotLayers
    spots={spots}
    selectedSpotId={selectedSpotId}
    onSpotSelect={handleSpotSelect}
    onClusterTap={handleClusterTap}
  />
</Mapbox.MapView>
```

**"Search This Area" Logic**:
- Shows when user pans >400m from last fetch center OR zooms >1 level
- Triggers new API fetch with current map center

---

### 4.2 Search Screen (`src/app/search.tsx`)

**Size**: ~264 lines  
**Purpose**: Text-based spot search

**Flow**:
1. User types query → calls `searchSpots(query)`
2. Results displayed in `FlatList`
3. Tap result → `router.replace({ pathname: '/', params: { selectedSpotId, centerLng, centerLat } })`
4. Map screen reads params → animates camera → opens bottom sheet

---

### 4.3 Photo Gallery (`src/app/photo-gallery/[spotId].tsx`)

**Size**: ~297 lines  
**Purpose**: Horizontal paginated photo viewer

**Features**:
- Full-screen horizontal `FlatList` with `pagingEnabled`
- Photo counter overlay (e.g., "3 / 12")
- "Navigate to this photo spot" button → opens native Maps app
- Uses `photo.variants.url_l` for display

---

## 5. Key Components

### 5.1 SpotLayers (`src/components/Map/SpotLayers.tsx`)

**Purpose**: Renders Mapbox markers with clustering

**Structure**:
```tsx
<Mapbox.ShapeSource
  shape={geoJSONFeatureCollection}
  cluster={true}
  clusterRadius={50}
  clusterMaxZoomLevel={14}
>
  <Mapbox.CircleLayer id="cluster-halo" />     // Cluster background halo
  <Mapbox.CircleLayer id="clusters" />          // Cluster circles
  <Mapbox.SymbolLayer id="cluster-count" />     // Cluster numbers
  <Mapbox.CircleLayer id="unclustered-point-halo" />  // Selected marker halo
  <Mapbox.CircleLayer id="unclustered-point" />       // Individual markers
  <Mapbox.CircleLayer id="high-score-ring" />         // Score >= 90 indicator
</Mapbox.ShapeSource>
```

**GeoJSON Conversion**:
```tsx
function spotsToGeoJSON(spots: Spot[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((spot) => ({
      type: 'Feature',
      id: spot.id,
      properties: { spotId: spot.id, name: spot.name, score: spot.score },
      geometry: { type: 'Point', coordinates: [spot.longitude, spot.latitude] },
    })),
  };
}
```

**Tap Handling**:
- Cluster tap → get expansion zoom → animate camera
- Individual marker tap → `onSpotSelect(spotId)` → opens bottom sheet

---

### 5.2 SpotBottomSheet (`src/components/Spot/SpotBottomSheet.tsx`)

**Size**: ~493 lines  
**Purpose**: Displays spot details when marker tapped

**Snap Points**: `['18%', '55%', '92%']`

**States**:
- `idle` / `loading` / `error` for both spot and photos

**Content by Snap Index**:
- **18% (collapsed)**: Name, distance, category chip, thumbnail
- **55% (half)**: + Description, action buttons
- **92% (expanded)**: + Photo grid, full details

**Key Actions**:
- **Navigate**: Opens native Maps with destination
- **View Photos**: Navigates to `/photo-gallery/[spotId]`

---

### 5.3 CategoryChips (`src/components/Spot/CategoryChips.tsx`)

**Purpose**: Horizontal scrollable category tags

```tsx
<CategoryChips categories={['Nature', 'Urban', 'Sunset']} maxDisplay={2} />
// Renders: [Nature] [Urban] [+1]
```

---

## 6. API Layer (`src/lib/api.ts`)

**Base URL**: `process.env.EXPO_PUBLIC_API_BASE_URL` or `http://localhost:8080`

### Endpoints

```typescript
// GET /api/spots?lat=43.65&lng=-79.38&radiusMeters=1500
async function getNearbySpots(lat: number, lng: number, radiusMeters: number): Promise<Spot[]>

// GET /api/spots/search?q=sunset&lat=43.65&lng=-79.38
async function searchSpots(query: string, lat?: number, lng?: number): Promise<Spot[]>

// GET /api/spots/{id}
async function getSpotById(id: string): Promise<Spot>

// GET /api/spots/{spotId}/photos
async function getSpotPhotos(spotId: string): Promise<Photo[]>
```

### Response Handling
```typescript
interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

// All functions unwrap .data automatically and throw on failure
```

---

## 7. Type Definitions (`src/types/api.ts`)

```typescript
export interface Spot {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  score: number;           // 0-100, higher = better
  categories: string[];    // e.g., ['Nature', 'Sunset', 'Urban']
  photoUrl: string | null; // Thumbnail URL
  distanceMeters?: number; // Populated by backend based on query location
}

export interface Photo {
  id: string;
  spotId: string;
  variants: PhotoVariant;
}

export interface PhotoVariant {
  url_l: string;      // Large URL for display
  latitude: number;   // Photo location (may differ from spot)
  longitude: number;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}
```

---

## 8. Local Storage (`src/lib/storage.ts`)

**Keys**:
- `@photospots/hasFetchedOnce` — `boolean` — Tracks first-ever fetch
- `@photospots/lastFetchedCenter` — `[lng, lat]` — Last API fetch location

**Functions**:
```typescript
async function getHasFetchedOnce(): Promise<boolean>
async function setHasFetchedOnce(value: boolean): Promise<void>
async function getLastFetchedCenter(): Promise<[number, number] | null>
async function setLastFetchedCenter(center: [number, number]): Promise<void>
```

---

## 9. Geo Utilities (`src/lib/geo.ts`)

```typescript
// Haversine formula - returns distance in meters
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number

// Wrapper accepting coordinate arrays
function distanceFromCoordinates(
  coord1: [number, number],  // [lng, lat]
  coord2: [number, number]
): number
```

---

## 10. Theme System (`src/constants/theme.ts`)

**Current Theme**: "Bright Explorer"

```typescript
export const THEME = {
  // Backgrounds
  BG: '#F8FAFC',          // Light gray background
  CARD: '#FFFFFF',        // White cards
  
  // Text
  TEXT: '#1E293B',        // Dark slate
  TEXT_MUTED: '#64748B',  // Muted gray
  
  // Accent (Primary Blue)
  ACCENT: '#2563EB',      // Blue 600
  ACCENT_2: '#3B82F6',    // Blue 500 (lighter)
  
  // Supporting
  BORDER: '#E2E8F0',      // Light border
  CLUSTER_LARGE: '#7C3AED', // Purple for 50+ clusters
  CLUSTER_TEXT: '#FFFFFF',  // White text on clusters
};
```

---

## 11. Expo Configuration (`app.json`)

**Key Settings**:
```json
{
  "expo": {
    "name": "Photospots",
    "slug": "Photospots",
    "scheme": "photospots",
    "newArchEnabled": true,
    "ios": {
      "bundleIdentifier": "com.yourcompany.photospots",
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "We need your location to show nearby photo spots"
      }
    },
    "android": {
      "package": "com.yourcompany.photospots",
      "permissions": ["ACCESS_FINE_LOCATION"]
    },
    "plugins": [
      ["@rnmapbox/maps", {
        "RNMapboxMapsImpl": "mapbox",
        "RNMapboxMapsDownloadToken": "sk.xxx"
      }]
    ]
  }
}
```

---

## 12. Known Issues & Notes

### Mapbox "Invalid size" Warning
```
[MapboxCommon] Invalid size {0.000000, 0.000000}, 
returning default size{64, 64} instead for image ...
```
- **Status**: Known, harmless
- **Cause**: Native iOS Mapbox SDK runs before RN layout provides dimensions
- **Impact**: None — map displays correctly after first frame
- **Reference**: https://github.com/rnmapbox/maps/issues/3876

### Camera Configuration
- Using `defaultSettings` prop (not `centerCoordinate`) to allow user pan/zoom
- Controlled camera causes map to "fight" user gestures

### Path Aliases
```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```
Usage: `import { Text } from '@/src/components/Themed'`

---

## 13. Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | Backend API base URL |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | Mapbox public access token |

---

## 14. Current Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Map display | ✅ Complete | Mapbox Street style |
| User location | ✅ Complete | With permission handling |
| Spot markers | ✅ Complete | Clustering, selection states |
| Bottom sheet | ✅ Complete | 3 snap points |
| Text search | ✅ Complete | Modal with results list |
| Photo gallery | ✅ Complete | Horizontal pager |
| Navigate to spot | ✅ Complete | Opens native Maps |
| Saved spots | 🚧 Placeholder | Tab exists, no functionality |
| Offline support | ❌ Not started | — |
| User accounts | ❌ Not started | — |

---

## 15. Data Flow Summary

```
User opens app
    ↓
_layout.tsx loads (GestureHandlerRootView, ThemeProvider, Stack)
    ↓
(tabs)/_layout.tsx loads (Tab navigator)
    ↓
(tabs)/index.tsx mounts
    ↓
Request location permission
    ├── Granted → Get current position
    └── Denied → Use Toronto fallback
    ↓
Check AsyncStorage for hasFetchedOnce
    ├── false → Call getNearbySpots() → Store spots in state
    └── true → Skip auto-fetch
    ↓
Render MapView with Camera + SpotLayers
    ↓
User taps marker → setSelectedSpotId() → SpotBottomSheet opens
    ↓
SpotBottomSheet calls getSpotById() for full details
    ↓
User can:
    • Navigate → Opens Maps app
    • View Photos → router.push('/photo-gallery/[spotId]')
    • Search → router.push('/search')
```

---

*Last updated: Based on current codebase state*
